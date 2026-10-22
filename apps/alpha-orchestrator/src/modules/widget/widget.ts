import { Elysia, t } from "elysia";
import { isIpBlocked } from "../blocked-ips/blocked-ips.service.ts";
import type { ChannelDirectory } from "../channel-directory/channel-directory.ts";
import type { Db } from "../database/database.ts";
import { recordCatalog } from "../mcp/mcp.service.ts";
import { NDJSON_LINES } from "../messages/messages.schema.ts";
import { ndjsonResponse } from "../streaming/streaming.service.ts";
import {
	createWidgetThread,
	isOwnThread,
	threadMessages,
} from "../threads/threads.service.ts";
import { createVisitor } from "../visitors/visitors.service.ts";
import {
	SuspendedResult,
	ThreadMessagesResult,
	VisitorResult,
	WidgetThreadResult,
} from "./widget.schema.ts";
import {
	ALLOWED_HEADERS,
	corsHeaders,
	emptyResponse,
	suspendedResponse,
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
		isOwnThread(db, threadId, auth.visitor.row.id)
			? null
			: emptyResponse(404, auth.origin);

	/** Rate limit, then thread ownership — the checks every message-like call needs. */
	const rejectIfNotAllowedToUse = (auth: WidgetAuth, threadId: string) =>
		guard.rejectIfOverMessageLimit(auth) ??
		rejectIfForeignThread(auth, threadId);

	return (
		new Elysia({ prefix: "/v1/widget", tags: ["Widget"] })
			// Before body parsing; `onRequest` is global, hence the path check.
			.onRequest(({ request }) =>
				new URL(request.url).pathname.startsWith("/v1/widget/")
					? (guard.rejectIfBodyTooLarge(request) ?? undefined)
					: undefined,
			)
			.options(
				"/*",
				({ request }) => {
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
				},
				{
					response: { 204: t.Void(), 403: t.Void() },
					detail: {
						summary: "CORS preflight",
						description:
							"Answers any widget path for an origin that belongs to a web channel; 403 for unknown origins.",
					},
				},
			)
			.post(
				"/visitors",
				({ request, server }) => {
					const origin = request.headers.get("origin") ?? "";
					const key = request.headers.get("x-publishable-key");
					const channel = key ? directory.byPublishableKey(key) : undefined;
					if (!channel) return emptyResponse(401);
					if (!channel.allowedOrigins.includes(origin))
						return emptyResponse(403);

					const ip = guard.clientIp(request, server);
					const ipHash = guard.hashClientIp(ip);
					const timestamp = now();
					if (
						channel.disabledAt !== null ||
						(ipHash && isIpBlocked(db, ipHash, channel.id, timestamp))
					) {
						return emptyResponse(403, origin);
					}
					if (directory.suspension(channel)) return suspendedResponse(origin);
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
				},
				{
					response: {
						201: VisitorResult,
						401: t.Void(),
						402: SuspendedResult,
						403: t.Void(),
						429: t.Void(),
					},
					detail: {
						summary: "Create an anonymous visitor",
						description:
							"Send the channel's publishable key in `X-Publishable-Key`; `Origin` must be in the channel's allowed origins. 401 unknown key, 403 wrong origin, disabled channel or blocked IP, 429 too many new visitors from this IP. Errors have empty bodies except 402 `{ code: \"channel_suspended\" }` (the owner has no plan or balance).",
					},
				},
			)
			.post(
				"/threads",
				({ request, server }) => {
					const auth = guard.authorize(request, server);
					if (auth instanceof Response) return auth;
					const tooMany = guard.rejectIfTooManyThreads(auth);
					if (tooMany) return tooMany;
					const threadId = createWidgetThread(
						db,
						auth.channel.id,
						auth.visitor.row.id,
						now(),
					);
					return Response.json(
						{ threadId },
						{ status: 201, headers: corsHeaders(auth.origin) },
					);
				},
				{
					response: {
						201: WidgetThreadResult,
						401: t.Void(),
						403: t.Void(),
						429: t.Void(),
					},
					detail: {
						summary: "Create a thread",
						description:
							"Authenticated by `X-Visitor-Token`. 401 missing or expired token, 403 not allowed, 429 too many threads this hour. Errors have empty bodies.",
					},
				},
			)
			.get(
				"/threads/:id/messages",
				({ request, server, params }) => {
					const auth = guard.authorize(request, server);
					if (auth instanceof Response) return auth;
					const foreign = rejectIfForeignThread(auth, params.id);
					if (foreign) return foreign;
					return Response.json(
						{ items: threadMessages(db, params.id, options.retentionPerUser) },
						{ headers: corsHeaders(auth.origin) },
					);
				},
				{
					response: {
						200: ThreadMessagesResult,
						401: t.Void(),
						403: t.Void(),
						404: t.Void(),
					},
					detail: {
						summary: "List thread messages",
						description:
							"The newest messages of the visitor's own thread, oldest first. Authenticated by `X-Visitor-Token`. 404 when the thread is not the visitor's. Errors have empty bodies.",
					},
				},
			)
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
						auth.visitor.row,
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
					detail: {
						summary: "Send a message and stream the reply",
						description: `Authenticated by \`X-Visitor-Token\`. Empty-body errors: 401, 403, 404 (foreign thread), 413 (text or customerContext over the limit), 429 (rate limit). \`402 { code: "channel_suspended" }\` when the channel's owner has no plan or balance.\n\n${NDJSON_LINES}`,
					},
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
						JSON.stringify(body.webmcpTools).length >
						options.maxWebmcpToolsChars
					) {
						return emptyResponse(413, auth.origin);
					}
					const rejected = rejectIfNotAllowedToUse(auth, body.threadId);
					if (rejected) return rejected;

					recordCatalog(db, auth.channel.id, body.webmcpTools, now());
					// Classifying a new catalog takes a model call per tool: answer now,
					// the thread's next reply waits for it (`ReplyService.pending`).
					reply
						.registerWebMcpTools(body.threadId, body.webmcpTools)
						.catch(() => {});
					return emptyResponse(204, auth.origin);
				},
				{
					response: {
						204: t.Void(),
						401: t.Void(),
						403: t.Void(),
						404: t.Void(),
						413: t.Void(),
						429: t.Void(),
					},
					detail: {
						summary: "Register the page's WebMCP tools",
						description:
							"The widget posts the tools the page exposes whenever its panel opens. Authenticated by `X-Visitor-Token`. Empty-body errors: 401, 403, 404 (foreign thread), 413 (catalog too large), 429.",
					},
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

					const rejected =
						guard.rejectIfOverToolResultLimit(auth) ??
						rejectIfForeignThread(auth, body.threadId);
					if (rejected) return rejected;

					const stream = reply.resumeReply(
						auth.visitor.row,
						body.threadId,
						{
							callId: body.callId,
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
					detail: {
						summary: "Return a browser tool result and resume the reply",
						description: `Answers a \`tool_call\` line of an earlier stream. Authenticated by \`X-Visitor-Token\`. Empty-body errors: 401, 403, 404 (foreign thread), 429 (tool-result rate limit).\n\n${NDJSON_LINES}`,
					},
					body: t.Object({
						threadId: t.String(),
						/** Must be the `tool_call` line's `callId` (checked against the checkpoint in `prepareResume`). */
						callId: t.String(),
						tool: t.String(),
						/** Where the visitor is now; a tool may have navigated. */
						page: PageField,
						/** What the tool answered; its text is kept for the next step (e.g. the search hits). */
						result: t.Unknown(),
						isError: t.Optional(t.Boolean()),
					}),
				},
			)
	);
}
