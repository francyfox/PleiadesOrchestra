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
