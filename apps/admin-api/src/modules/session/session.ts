import { resolveClientIp } from "@repo/elysia-kit";
import { APIError } from "better-auth/api";
import { Elysia, t } from "elysia";
import type { RouteDeps } from "../../app.types.ts";
import { LEVEL } from "../accounts/accounts.schema.ts";
import { currentSession } from "../auth/auth.service.ts";
import { withTrustedIp } from "../client-ip/client-ip.service.ts";
import { ApiError } from "../common/common.schema.ts";
import {
	type ServerLike,
	tooManyAttempts,
	withCookies,
} from "../common/common.service.ts";
import { Session, TokenLogin } from "./session.schema.ts";

/**
 * Who is signed in, staff token sign-in and logout (users sign in through `/user/*`). Wraps better-auth's
 * server API instead of exposing its raw HTTP handler, so every endpoint is
 * typed and documented and returns codes, not better-auth's message text.
 */
export function sessionRoutes({
	auth,
	admins,
	clientIp,
	loginThrottle,
}: RouteDeps) {
	const ipOf = (request: Request, server: ServerLike | null) =>
		resolveClientIp({
			source: clientIp.source,
			hops: clientIp.hops,
			headers: request.headers,
			socketIp: server?.requestIP(request)?.address,
		});

	return new Elysia({ name: "admin-api.session", tags: ["auth"] })
		.get(
			"/session",
			async ({ request }) => {
				const session = await currentSession(auth, request.headers);
				return {
					setupRequired: !(await admins.hasAdmin()),
					admin: session
						? {
								id: session.user.id,
								name: session.user.name,
								email: session.user.email,
								level: session.user.level,
								isSuper: session.user.level === LEVEL.super,
							}
						: null,
				};
			},
			{
				response: Session,
				detail: {
					summary: "Current session",
					description:
						"`admin` is the signed-in account, staff or user (`level` 0/100/200), or null. `setupRequired` is true while no staff account exists: run `admin:create`.",
				},
			},
		)
		.post(
			"/auth/token",
			async ({ body, request, server, status }) => {
				const ip = ipOf(request, server);
				// One budget per client IP: a shared key would let anyone lock every admin out.
				const key = `token:${ip}`;
				const wait = loginThrottle.loginRetryAfter(ip, key);
				if (wait > 0) return tooManyAttempts(wait);
				try {
					const { headers } = await auth.api.signInStaffToken({
						body: { token: body.token.trim() },
						headers: withTrustedIp(request.headers, ip),
						returnHeaders: true,
					});
					loginThrottle.loginSucceeded(key);
					return withCookies({ ok: true }, headers);
				} catch (error) {
					if (error instanceof APIError) {
						if (error.statusCode === 403) {
							return status(403, { error: "banned" });
						}
						loginThrottle.loginFailed(ip, key);
						return status(401, { error: "invalid_token" });
					}
					throw error;
				}
			},
			{
				body: TokenLogin,
				response: {
					200: t.Object({ ok: t.Boolean() }),
					401: ApiError,
					403: ApiError,
					429: ApiError,
				},
				detail: {
					summary: "Staff sign-in with an access token",
					description:
						"Sets the session cookie. Wrong, malformed, rotated and user tokens are all `invalid_token` (401). After repeated failures the client IP is locked: 429 `too_many_attempts` with `Retry-After`.",
				},
			},
		)
		.post(
			"/auth/logout",
			async ({ request }) => {
				const { headers } = await auth.api.signOut({
					headers: request.headers,
					returnHeaders: true,
				});
				return withCookies(null, headers, 204);
			},
			{
				detail: {
					summary: "Sign out",
					description: "Clears the session cookie (staff and users).",
				},
			},
		);
}
