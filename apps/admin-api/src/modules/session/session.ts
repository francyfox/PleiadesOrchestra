import { APIError } from "better-auth/api";
import { Elysia, t } from "elysia";
import type { RouteDeps } from "../../app.types.ts";
import { MIN_PASSWORD } from "../admin-policy/admin-policy.service.ts";
import { Credentials } from "../admins/admins.schema.ts";
import { ApiError } from "../common/common.schema.ts";
import { Registration, Session } from "./session.schema.ts";

/** A JSON response that also carries better-auth's `Set-Cookie` headers (several: session token + data). */
function withCookies(body: unknown, source: Headers, status = 200): Response {
	const headers = new Headers({ "content-type": "application/json" });
	for (const cookie of source.getSetCookie())
		headers.append("set-cookie", cookie);
	return new Response(body === null ? null : JSON.stringify(body), {
		status,
		headers,
	});
}

/**
 * Who is signed in, and login / registration / logout. Wraps better-auth's
 * server API instead of exposing its raw HTTP handler, so every endpoint is
 * typed and documented and returns codes, not better-auth's message text.
 */
export function sessionRoutes({ auth, admins }: RouteDeps) {
	return new Elysia({ name: "admin-api.session", tags: ["auth"] })
		.get(
			"/session",
			async ({ request }) => {
				const session = await auth.api.getSession({ headers: request.headers });
				return {
					setupRequired: !(await admins.hasAdmin()),
					admin: session
						? {
								id: session.user.id,
								name: session.user.name,
								email: session.user.email,
								isSuper: session.user.id === (await admins.superId()),
							}
						: null,
				};
			},
			{
				response: Session,
				detail: {
					summary: "Current session",
					description:
						"`setupRequired` is true until the first admin registers; `admin` is null when not signed in.",
				},
			},
		)
		.post(
			"/auth/login",
			async ({ body, request, status }) => {
				const email = body.email.trim();
				if (!email || !body.password) {
					return status(400, { error: "missing_credentials" });
				}
				try {
					const { headers } = await auth.api.signInEmail({
						body: { email, password: body.password },
						headers: request.headers,
						returnHeaders: true,
					});
					return withCookies({ ok: true }, headers);
				} catch (error) {
					if (error instanceof APIError) {
						return status(400, { error: "invalid_credentials" });
					}
					throw error;
				}
			},
			{
				body: Credentials,
				response: { 200: t.Object({ ok: t.Boolean() }), 400: ApiError },
				detail: { summary: "Sign in", description: "Sets the session cookie." },
			},
		)
		.post(
			"/auth/register",
			async ({ body, request, status }) => {
				const email = body.email.trim();
				if (!email || body.password.length < MIN_PASSWORD) {
					return status(400, { error: "weak_credentials", min: MIN_PASSWORD });
				}
				try {
					const { headers } = await auth.api.signUpEmail({
						body: {
							name: body.name?.trim() || email,
							email,
							password: body.password,
						},
						headers: request.headers,
						returnHeaders: true,
					});
					return withCookies({ ok: true }, headers);
				} catch (error) {
					if (error instanceof APIError) {
						if (error.statusCode === 403) {
							return status(403, { error: "registration_closed" });
						}
						return status(400, {
							error: "signup_failed",
							detail: error.body?.message,
						});
					}
					throw error;
				}
			},
			{
				body: Registration,
				response: {
					200: t.Object({ ok: t.Boolean() }),
					400: ApiError,
					403: ApiError,
				},
				detail: {
					summary: "Register the first admin",
					description:
						"Only works while no admin exists; closed afterwards (further admins are created by an admin).",
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
					description: "Clears the session cookie.",
				},
			},
		);
}
