import { isAllowed } from "../access/access.service.ts";
import { isIpBlocked } from "../blocked-ips/blocked-ips.service.ts";
import type { ChannelDirectory } from "../channel-directory/channel-directory.ts";
import type { ChannelRow } from "../channels/channels.types.ts";
import type { Db } from "../database/database.ts";
import { HOUR_MS, MINUTE_MS } from "../http/http.service.ts";
import { FixedWindowLimiter } from "../rate-limit/rate-limit.ts";
import { hashIp } from "../security/security.service.ts";
import {
	findVisitor,
	touchVisitor,
	type Visitor,
} from "../visitors/visitors.service.ts";
import type { WidgetOptions } from "./widget.types.ts";

export const ALLOWED_HEADERS =
	"content-type, x-visitor-token, x-publishable-key";

export function corsHeaders(origin: string): Record<string, string> {
	return { "access-control-allow-origin": origin, vary: "Origin" };
}

/** A body-less response, with CORS headers when the origin is known. */
export function emptyResponse(status: number, origin?: string): Response {
	return new Response(null, {
		status,
		headers: origin ? corsHeaders(origin) : undefined,
	});
}

/** Paths served by the widget routes — exempt from the transport-key check. */
export function isPublicWidgetPath(pathname: string): boolean {
	return (
		pathname.startsWith("/v1/widget/") ||
		/^\/v1\/channels\/[^/]+\/identify$/.test(pathname)
	);
}

/** The part of Bun's `Server` the widget needs. */
export interface ServerLike {
	requestIP(request: Request): { address: string } | null;
}

export interface WidgetAuth {
	visitor: Visitor;
	channel: ChannelRow;
	origin: string;
	/** Salted hash of the client IP; `null` when it is unknown. */
	ipHash: string | null;
}

interface GuardDeps {
	db: Db;
	directory: ChannelDirectory;
	ipHashSalt: string;
	now: () => number;
	options: WidgetOptions;
}

/**
 * Checks done before a widget request is handled: who the visitor is, whether
 * their origin and IP are allowed, and the in-memory rate limits.
 */
export class WidgetGuard {
	private readonly ttlMs: number;
	private readonly tokenLimiter: FixedWindowLimiter;
	private readonly ipLimiter: FixedWindowLimiter;
	private readonly newVisitorLimiter: FixedWindowLimiter;

	constructor(private readonly deps: GuardDeps) {
		const { options, now } = deps;
		this.ttlMs = options.tokenTtlHours * HOUR_MS;
		this.tokenLimiter = new FixedWindowLimiter(
			options.messagesPerMinute,
			MINUTE_MS,
			now,
		);
		this.ipLimiter = new FixedWindowLimiter(
			options.ipMessagesPerMinute,
			MINUTE_MS,
			now,
		);
		this.newVisitorLimiter = new FixedWindowLimiter(
			options.visitorsPerHourPerIp,
			HOUR_MS,
			now,
		);
	}

	get tokenTtl(): number {
		return this.ttlMs;
	}

	clientIp(request: Request, server: ServerLike | null): string | null {
		const ip = this.deps.options.trustProxy
			? request.headers.get("x-forwarded-for")?.split(",")[0]?.trim()
			: server?.requestIP(request)?.address;
		return ip || null;
	}

	hashClientIp(ip: string | null): string | null {
		return ip ? hashIp(ip, this.deps.ipHashSalt) : null;
	}

	/**
	 * Token → visitor → channel, then origin and access checks. Returns a
	 * ready-made error `Response` when the request must stop here; denied
	 * visitors get an empty 403 and the widget simply stays silent.
	 *
	 * The visitor's "last seen" write happens last, so requests that are
	 * rejected anyway cost no database writes.
	 */
	authorize(
		request: Request,
		server: ServerLike | null,
	): WidgetAuth | Response {
		const { db, directory, now } = this.deps;
		const origin = request.headers.get("origin") ?? "";
		const ip = this.clientIp(request, server);
		const token = request.headers.get("x-visitor-token");
		const found = token ? findVisitor(db, token, now()) : null;
		if (!found) {
			// CORS headers only if the origin is a known web channel, so the
			// widget can tell "expired" from a network error.
			return emptyResponse(
				401,
				directory.isWebOrigin(origin) ? origin : undefined,
			);
		}

		const channel = directory.byId(found.channelId);
		if (!channel?.allowedOrigins.includes(origin)) return emptyResponse(403);

		const ipHash = this.hashClientIp(ip);
		if (
			!isAllowed(channel, found.user) ||
			(ipHash && isIpBlocked(db, ipHash, channel.id, now()))
		) {
			return emptyResponse(403, origin);
		}

		const visitor = touchVisitor(db, found, now(), this.ttlMs, ip);
		return { visitor, channel, origin, ipHash };
	}

	/** `429` when the visitor's token or IP is over its per-minute message budget. */
	rejectIfOverMessageLimit({
		visitor,
		origin,
		ipHash,
	}: WidgetAuth): Response | null {
		const overLimit =
			!this.tokenLimiter.hit(visitor.tokenHash) ||
			(ipHash !== null && !this.ipLimiter.hit(ipHash));
		return overLimit ? emptyResponse(429, origin) : null;
	}

	/** `429` when this IP already created too many visitor tokens this hour. */
	rejectIfTooManyNewVisitors(
		ipHash: string | null,
		origin: string,
	): Response | null {
		return ipHash && !this.newVisitorLimiter.hit(ipHash)
			? emptyResponse(429, origin)
			: null;
	}
}
