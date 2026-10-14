/**
 * Where the client IP comes from. It feeds the per-IP widget limits and IP
 * blocks, so it must be something the client can't choose:
 *
 * - `socket` — the TCP peer address. Right when nothing sits in front of the
 *   service; behind a proxy every request shares the proxy's address.
 * - `cf-connecting-ip` — the `CF-Connecting-IP` header Cloudflare sets
 *   (overwriting any client value). Only safe when every request comes
 *   through Cloudflare (tunnel); a direct hit to the port can forge it.
 * - `xff-rightmost` — `X-Forwarded-For` read from the right. Each proxy
 *   appends the address it received the request from, so only the entries
 *   added by trusted proxies are honest; the head is client-controlled.
 */
export const CLIENT_IP_SOURCES = [
	"socket",
	"cf-connecting-ip",
	"xff-rightmost",
] as const;

export type ClientIpSource = (typeof CLIENT_IP_SOURCES)[number];

export interface ResolveClientIpInput {
	source: ClientIpSource;
	/**
	 * `xff-rightmost` only: how many trusted proxies append to
	 * `X-Forwarded-For` in front of this service. The client IP is the
	 * `hops`-th entry from the right (1 = rightmost, written by the proxy
	 * closest to the client — e.g. Cloudflare's edge).
	 */
	hops: number;
	headers: Headers;
	/** The socket peer address (`server.requestIP(request)?.address`). */
	socketIp: string | null | undefined;
}

/**
 * The client IP per `source`; falls back to the socket address when the
 * expected header is missing, too short or blank. `null` if nothing is known.
 */
export function resolveClientIp({
	source,
	hops,
	headers,
	socketIp,
}: ResolveClientIpInput): string | null {
	const socket = socketIp?.trim() || null;
	switch (source) {
		case "socket":
			return socket;
		case "cf-connecting-ip":
			return headers.get("cf-connecting-ip")?.trim() || socket;
		case "xff-rightmost": {
			const entries = headers.get("x-forwarded-for")?.split(",") ?? [];
			if (hops < 1 || entries.length < hops) return socket;
			return entries[entries.length - hops]?.trim() || socket;
		}
	}
}

/**
 * Header better-auth is told to read the client IP from (`advanced.ipAddress`).
 * The session routes overwrite it with the trusted IP from `resolveClientIp`,
 * so a client-sent `X-Forwarded-For` never reaches better-auth's own IP logic.
 */
export const TRUSTED_IP_HEADER = "x-admin-client-ip";

/** Copy of the request headers with every client-controlled IP header replaced by the trusted one. */
export function withTrustedIp(headers: Headers, ip: string | null): Headers {
	const copy = new Headers(headers);
	for (const name of ["x-forwarded-for", "x-real-ip", "cf-connecting-ip"]) {
		copy.delete(name);
	}
	if (ip) copy.set(TRUSTED_IP_HEADER, ip);
	else copy.delete(TRUSTED_IP_HEADER);
	return copy;
}
