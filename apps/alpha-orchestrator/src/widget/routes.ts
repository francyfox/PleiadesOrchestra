import { timingSafeEqual } from "node:crypto";
import { Elysia, t } from "elysia";
import { isAllowed } from "../access.ts";
import { hashIp, sha256Hex } from "../admin/channels.ts";
import { compressIfAccepted } from "../compression.ts";
import type { Db } from "../db/client.ts";
import type { ChannelDirectory, ChannelRow, UserRow } from "../db/identity.ts";
import { identifyVisitor } from "./identify.ts";
import { FixedWindowLimiter } from "./rate-limit.ts";
import {
	createVisitor,
	createWidgetThread,
	isIpBlocked,
	isOwnThread,
	threadMessages,
	useVisitor,
	type Visitor,
} from "./visitors.ts";

export interface WidgetOptions {
	/** Longest accepted message text (characters). */
	maxTextChars: number;
	/** Messages per visitor token per minute. */
	messagesPerMinute: number;
	/** Messages per client IP per minute, across all visitors. */
	ipMessagesPerMinute: number;
	/** New visitor tokens per client IP per hour. */
	visitorsPerHourPerIp: number;
	/** Take the client IP from `X-Forwarded-For` (only behind a proxy you control). */
	trustProxy: boolean;
	/** Sliding visitor-token lifetime — same as the anonymous-user retention. */
	tokenTtlHours: number;
	/** Messages kept per user; re-applied after an identify merge. */
	retentionPerUser: number;
}

export const DEFAULT_WIDGET_OPTIONS: WidgetOptions = {
	maxTextChars: 2000,
	messagesPerMinute: 10,
	ipMessagesPerMinute: 30,
	visitorsPerHourPerIp: 20,
	trustProxy: false,
	tokenTtlHours: 24,
	retentionPerUser: 10,
};

export interface WidgetDeps {
	db: Db;
	channels: ChannelDirectory;
	ipHashSalt: string;
	now: () => number;
	options: WidgetOptions;
	/** Runs the GOAP reply for an already-authorized user/thread (shared with /v1/messages). */
	startReply(
		user: UserRow,
		threadId: string,
		text: string,
		signal?: AbortSignal,
	): ReadableStream;
}

const MINUTE_MS = 60 * 1000;
const HOUR_MS = 60 * MINUTE_MS;

const ALLOWED_HEADERS = "content-type, x-visitor-token, x-publishable-key";

function corsHeaders(origin: string): Record<string, string> {
	return {
		"access-control-allow-origin": origin,
		vary: "Origin",
	};
}

/** Paths served by these routes — exempt from the transport-key check in server.ts. */
export function isPublicWidgetPath(pathname: string): boolean {
	return (
		pathname.startsWith("/v1/widget/") ||
		/^\/v1\/channels\/[^/]+\/identify$/.test(pathname)
	);
}

interface ServerLike {
	requestIP(request: Request): { address: string } | null;
}

/**
 * Public API for the web chat widget (browser-facing) plus the host site's
 * backend `identify` call. Browser requests are authenticated by a
 * publishable key (to get a visitor token) and then the visitor token;
 * `Origin` must be one of the channel's `allowedOrigins`.
 */
export function widgetRoutes(deps: WidgetDeps) {
	const { db, options } = deps;
	const ttlMs = options.tokenTtlHours * HOUR_MS;
	const tokenLimiter = new FixedWindowLimiter(
		options.messagesPerMinute,
		MINUTE_MS,
		deps.now,
	);
	const ipLimiter = new FixedWindowLimiter(
		options.ipMessagesPerMinute,
		MINUTE_MS,
		deps.now,
	);
	const visitorLimiter = new FixedWindowLimiter(
		options.visitorsPerHourPerIp,
		HOUR_MS,
		deps.now,
	);

	const clientIp = (
		request: Request,
		server: ServerLike | null,
	): string | null =>
		(options.trustProxy
			? request.headers.get("x-forwarded-for")?.split(",")[0]?.trim()
			: server?.requestIP(request)?.address) || null;

	const empty = (status: number, origin?: string) =>
		new Response(null, {
			status,
			headers: origin ? corsHeaders(origin) : undefined,
		});

	type Authorized = {
		visitor: Visitor;
		channel: ChannelRow;
		origin: string;
		ipHash: string | null;
	};

	/**
	 * Token → visitor → channel, then origin and access checks. Returns a
	 * ready-made error Response when the request must stop here. Denied
	 * visitors get an empty 403 — the widget simply stays silent.
	 */
	const authorize = (
		request: Request,
		server: ServerLike | null,
	): Authorized | Response => {
		const origin = request.headers.get("origin") ?? "";
		// CORS headers on the rejection only if the origin is a known web channel,
		// so the widget can tell "expired" from a network error.
		const knownOrigin = deps.channels.isWebOrigin(origin) ? origin : undefined;

		const ip = clientIp(request, server);
		const token = request.headers.get("x-visitor-token");
		const visitor = token ? useVisitor(db, token, deps.now(), ttlMs, ip) : null;
		if (!visitor) return empty(401, knownOrigin);

		const channel = deps.channels.byId(visitor.channelId);
		if (!channel?.allowedOrigins.includes(origin)) {
			return empty(403);
		}

		const ipHash = ip ? hashIp(ip, deps.ipHashSalt) : null;
		if (
			!isAllowed(channel, visitor.user) ||
			(ipHash && isIpBlocked(db, ipHash, channel.id, deps.now()))
		) {
			return empty(403, origin);
		}
		return { visitor, channel, origin, ipHash };
	};

	return new Elysia()
		.options("/v1/widget/*", ({ request }) => {
			const origin = request.headers.get("origin") ?? "";
			if (!deps.channels.isWebOrigin(origin)) return empty(403);
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
		.post("/v1/widget/visitors", ({ request, server }) => {
			const origin = request.headers.get("origin") ?? "";
			const key = request.headers.get("x-publishable-key");
			const channel = key ? deps.channels.byPublishableKey(key) : undefined;
			if (!channel) return empty(401);
			if (!channel.allowedOrigins.includes(origin)) return empty(403);

			const now = deps.now();
			const ip = clientIp(request, server);
			const ipHash = ip ? hashIp(ip, deps.ipHashSalt) : null;
			if (
				channel.disabledAt !== null ||
				(ipHash && isIpBlocked(db, ipHash, channel.id, now))
			) {
				return empty(403, origin);
			}
			if (ipHash && !visitorLimiter.hit(ipHash)) return empty(429, origin);

			const { visitorToken, expiresAt } = createVisitor(
				db,
				channel.id,
				now,
				ttlMs,
				ip,
			);
			return Response.json(
				{ visitorToken, expiresAt },
				{ status: 201, headers: corsHeaders(origin) },
			);
		})
		.post("/v1/widget/threads", ({ request, server }) => {
			const auth = authorize(request, server);
			if (auth instanceof Response) return auth;
			const threadId = createWidgetThread(
				db,
				auth.channel.id,
				auth.visitor.user.id,
				deps.now(),
			);
			return Response.json(
				{ threadId },
				{ status: 201, headers: corsHeaders(auth.origin) },
			);
		})
		.get("/v1/widget/threads/:id/messages", ({ request, server, params }) => {
			const auth = authorize(request, server);
			if (auth instanceof Response) return auth;
			if (!isOwnThread(db, params.id, auth.visitor.user.id)) {
				return empty(404, auth.origin);
			}
			return Response.json(
				{ items: threadMessages(db, params.id, options.retentionPerUser) },
				{ headers: corsHeaders(auth.origin) },
			);
		})
		.post(
			"/v1/widget/messages",
			({ request, server, body }) => {
				const auth = authorize(request, server);
				if (auth instanceof Response) return auth;
				const { visitor, origin, ipHash } = auth;

				if (body.text.length > options.maxTextChars) return empty(413, origin);
				if (
					!tokenLimiter.hit(visitor.tokenHash) ||
					(ipHash && !ipLimiter.hit(ipHash))
				) {
					return empty(429, origin);
				}
				if (!isOwnThread(db, body.threadId, visitor.user.id)) {
					return empty(404, origin);
				}

				const stream = deps.startReply(
					visitor.user,
					body.threadId,
					body.text,
					request.signal,
				);
				const { body: responseBody, encoding } = compressIfAccepted(
					stream,
					request.headers.get("accept-encoding"),
				);

				return new Response(responseBody, {
					headers: {
						...corsHeaders(origin),
						"content-type": "application/x-ndjson",
						...(encoding ? { "content-encoding": encoding } : {}),
					},
				});
			},
			{ body: t.Object({ threadId: t.String(), text: t.String() }) },
		)
		.post(
			"/v1/channels/:slug/identify",
			({ request, params, body }) => {
				const channel = deps.channels.bySlug(params.slug);
				if (!channel) return empty(404);
				if (!secretMatches(channel, request.headers.get("authorization"))) {
					return empty(401);
				}
				const result = identifyVisitor(db, {
					channelId: channel.id,
					visitorToken: body.visitorToken,
					externalUserId: body.externalUserId,
					retentionPerUser: options.retentionPerUser,
					now: deps.now(),
				});
				if (result.status === "unknown_visitor") return empty(404);
				if (result.status === "conflict") return empty(409);
				return { userId: result.userId, merged: result.merged };
			},
			{
				body: t.Object({
					visitorToken: t.String(),
					externalUserId: t.String({ minLength: 1 }),
				}),
			},
		);
}

/** `Authorization: Bearer <channel secret key>`, compared by hash in constant time. */
function secretMatches(channel: ChannelRow, authorization: string | null) {
	if (channel.kind !== "web" || !channel.secretKeyHash) return false;
	if (!authorization?.startsWith("Bearer ")) return false;
	const given = Buffer.from(sha256Hex(authorization.slice("Bearer ".length)));
	const expected = Buffer.from(channel.secretKeyHash);
	return given.length === expected.length && timingSafeEqual(given, expected);
}
