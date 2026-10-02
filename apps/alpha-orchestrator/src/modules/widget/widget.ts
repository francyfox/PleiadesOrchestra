import { Elysia, t } from "elysia";
import { isIpBlocked } from "../blocked-ips/blocked-ips.service.ts";
import type { ChannelDirectory } from "../channel-directory/channel-directory.ts";
import type { Db } from "../database/database.ts";
import { recordCatalog } from "../mcp/mcp.service.ts";
import { ndjsonResponse } from "../streaming/streaming.service.ts";
import {
	createWidgetThread,
	isOwnThread,
	threadMessages,
} from "../threads/threads.service.ts";
import { createVisitor } from "../visitors/visitors.service.ts";
import {
	ALLOWED_HEADERS,
	corsHeaders,
	emptyResponse,
	type WidgetAuth,
	WidgetGuard,
} from "./widget.service.ts";
import {
	MAX_PAGE_CHARS,
	type WidgetOptions,
	type WidgetReply,
} from "./widget.types.ts";

export { isPublicWidgetPath } from "./widget.service.ts";
export type { WidgetOptions } from "./widget.types.ts";
export { DEFAULT_WIDGET_OPTIONS } from "./widget.types.ts";

export interface WidgetDeps {
	db: Db;
	directory: ChannelDirectory;
	ipHashSalt: string;
	now: () => number;
	options: WidgetOptions;
	reply: WidgetReply;
}

/** `location.pathname + location.search` of the visitor's page; the widget cuts it at this length. */
const PageField = t.Optional(t.String({ maxLength: MAX_PAGE_CHARS }));

/** Matches `@repo/core`'s `WebMcpToolDescriptor`. */
const WebMcpToolSchema = t.Object({
	name: t.String(),
	description: t.Optional(t.String()),
	inputSchema: t.Optional(
		t.Object({
			type: t.Literal("object"),
			properties: t.Optional(t.Record(t.String(), t.Unknown())),
			// Without this Elysia drops `required` from the body, and the planner
			// can't tell which parameters it has to fill.
			required: t.Optional(t.Array(t.String())),
		}),
	),
});

/**
 * Public API of the web chat widget (browser-facing). Browser requests are
 * authenticated by a publishable key (to get a visitor token) and then the
 * visitor token; `Origin` must be one of the channel's `allowedOrigins`.
 */
export function widgetRoutes(deps: WidgetDeps) {
	const { db, directory, options, reply, now } = deps;
	const guard = new WidgetGuard(deps);

	/** Stops the request unless `threadId` belongs to this visitor. */
	const rejectIfForeignThread = (auth: WidgetAuth, threadId: string) =>
		isOwnThread(db, threadId, auth.visitor.user.id)
			? null
			: emptyResponse(404, auth.origin);

	/** Rate limit, then thread ownership — the checks every message-like call needs. */
	const rejectIfNotAllowedToUse = (auth: WidgetAuth, threadId: string) =>
		guard.rejectIfOverMessageLimit(auth) ??
		rejectIfForeignThread(auth, threadId);

	return new Elysia({ prefix: "/v1/widget" })
		.options("/*", ({ request }) => {
			const origin = request.headers.get("origin") ?? "";
			if (!directory.isWebOrigin(origin)) return emptyResponse(403);
			return new Response(null, {
				status: 204,
				headers: {
					...corsHeaders(origin),
					"access-control-allow-methods": "GET, POST, OPTIONS",
					"access-control-allow-headers": ALLOWED_HEADERS,
					"access-control-max-age": "600",
				},
			});
		})
		.post("/visitors", ({ request, server }) => {
			const origin = request.headers.get("origin") ?? "";
			const key = request.headers.get("x-publishable-key");
			const channel = key ? directory.byPublishableKey(key) : undefined;
			if (!channel) return emptyResponse(401);
			if (!channel.allowedOrigins.includes(origin)) return emptyResponse(403);

			const ip = guard.clientIp(request, server);
			const ipHash = guard.hashClientIp(ip);
			const timestamp = now();
			if (
				channel.disabledAt !== null ||
				(ipHash && isIpBlocked(db, ipHash, channel.id, timestamp))
			) {
				return emptyResponse(403, origin);
			}
			const tooMany = guard.rejectIfTooManyNewVisitors(ipHash, origin);
			if (tooMany) return tooMany;

			const { visitorToken, expiresAt } = createVisitor(
				db,
				channel.id,
				timestamp,
				guard.tokenTtl,
				ip,
			);
			return Response.json(
				{ visitorToken, expiresAt },
				{ status: 201, headers: corsHeaders(origin) },
			);
		})
		.post("/threads", ({ request, server }) => {
			const auth = guard.authorize(request, server);
			if (auth instanceof Response) return auth;
			const threadId = createWidgetThread(
				db,
				auth.channel.id,
				auth.visitor.user.id,
				now(),
			);
			return Response.json(
				{ threadId },
				{ status: 201, headers: corsHeaders(auth.origin) },
			);
		})
		.get("/threads/:id/messages", ({ request, server, params }) => {
			const auth = guard.authorize(request, server);
			if (auth instanceof Response) return auth;
			const foreign = rejectIfForeignThread(auth, params.id);
			if (foreign) return foreign;
			return Response.json(
				{ items: threadMessages(db, params.id, options.retentionPerUser) },
				{ headers: corsHeaders(auth.origin) },
			);
		})
		.post(
			"/messages",
			({ request, server, body }) => {
				const auth = guard.authorize(request, server);
				if (auth instanceof Response) return auth;

				if (body.text.length > options.maxTextChars) {
					return emptyResponse(413, auth.origin);
				}
				// Same cap as `text`: bounds how much extra data an integration can
				// push into the WorldState (and, on an unfinished run, into storage).
				if (
					body.customerContext &&
					JSON.stringify(body.customerContext).length > options.maxTextChars
				) {
					return emptyResponse(413, auth.origin);
				}
				const rejected = rejectIfNotAllowedToUse(auth, body.threadId);
				if (rejected) return rejected;

				const stream = reply.startReply(
					auth.visitor.user,
					body.threadId,
					body.text,
					{
						signal: request.signal,
						customerContext: body.customerContext,
						page: body.page,
					},
				);
				return ndjsonResponse(stream, request, corsHeaders(auth.origin));
			},
			{
				body: t.Object({
					threadId: t.String(),
					text: t.String(),
					page: PageField,
					customerContext: t.Optional(
						t.Record(
							t.String(),
							t.Union([t.String(), t.Number(), t.Boolean()]),
						),
					),
				}),
			},
		)
		.post(
			"/tools",
			async ({ request, server, body }) => {
				const auth = guard.authorize(request, server);
				if (auth instanceof Response) return auth;

				if (
					JSON.stringify(body.webmcpTools).length > options.maxWebmcpToolsChars
				) {
					return emptyResponse(413, auth.origin);
				}
				const rejected = rejectIfNotAllowedToUse(auth, body.threadId);
				if (rejected) return rejected;

				recordCatalog(db, auth.channel.id, body.webmcpTools, now());
				await reply.registerWebMcpTools(body.threadId, body.webmcpTools);
				return emptyResponse(204, auth.origin);
			},
			{
				body: t.Object({
					threadId: t.String(),
					webmcpTools: t.Array(WebMcpToolSchema),
				}),
			},
		)
		.post(
			"/tool-results",
			({ request, server, body }) => {
				const auth = guard.authorize(request, server);
				if (auth instanceof Response) return auth;

				const rejected = rejectIfNotAllowedToUse(auth, body.threadId);
				if (rejected) return rejected;

				const stream = reply.resumeReply(
					auth.visitor.user,
					body.threadId,
					{
						tool: body.tool,
						isError: body.isError ?? false,
						result: body.result,
						page: body.page,
					},
					request.signal,
				);
				return ndjsonResponse(stream, request, corsHeaders(auth.origin));
			},
			{
				body: t.Object({
					threadId: t.String(),
					/** Matches the `tool_call` line's `callId`; not read server-side yet (one in-flight tool call per thread). */
					callId: t.String(),
					tool: t.String(),
					/** Where the visitor is now; a tool may have navigated. */
					page: PageField,
					/** What the tool answered; its text is kept for the next step (e.g. the search hits). */
					result: t.Unknown(),
					isError: t.Optional(t.Boolean()),
				}),
			},
		);
}
