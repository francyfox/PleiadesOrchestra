import type { Rejection } from "@repo/elysia-kit";

const SAFE_METHODS = new Set(["GET", "HEAD", "OPTIONS"]);

/**
 * CSRF defence for cookie-authenticated, state-changing routes: a browser
 * always sends `Origin` on such requests, so one that isn't the panel's own
 * is refused. Requests without `Origin` (curl, server-to-server) carry no
 * ambient cookie and pass. `localhost` and `127.0.0.1` are different origins
 * to a browser — list every address the panel is opened at.
 */
export function foreignOriginRejection(trustedOrigins: readonly string[]) {
	return (request: Request): Rejection | undefined => {
		if (SAFE_METHODS.has(request.method)) return;
		if (isForeignOrigin(request, trustedOrigins)) {
			return { status: 403, body: "Forbidden origin" };
		}
	};
}

/**
 * A browser sends `Origin` on every WebSocket handshake, and a GET upgrade
 * carries the session cookie, so the read-only exemption above must not
 * cover it: cross-site WebSocket hijacking is the CSRF of sockets.
 */
export function isForeignOrigin(
	request: Request,
	trustedOrigins: readonly string[],
): boolean {
	const origin = request.headers.get("origin");
	return origin !== null && !trustedOrigins.includes(origin);
}
