import { resolveClientIp } from "@repo/elysia-kit";
import { APIError } from "better-auth/api";
import { Elysia, t } from "elysia";
import type { RouteDeps } from "../../app.types.ts";
import { isEmail, MIN_PASSWORD } from "../admin-policy/admin-policy.service.ts";
import { requireAdmin } from "../auth/auth.service.ts";
import { polarErrors } from "../billing/billing.service.ts";
import { withTrustedIp } from "../client-ip/client-ip.service.ts";
import { ApiError } from "../common/common.schema.ts";
import {
	type ServerLike,
	tooManyAttempts,
	withCookies,
} from "../common/common.service.ts";
import { orchestratorErrors } from "../orchestrator/orchestrator.service.ts";
import {
	ChangeEmailInput,
	DeleteMeInput,
	ForgotInput,
	isStaff,
	Me,
	ResetInput,
	UpdateMeInput,
	UserLogin,
	UserRegistration,
} from "./accounts.schema.ts";
import { deleteAccount, findByEmail } from "./accounts.service.ts";

const Ok = t.Object({ ok: t.Boolean() });

/**
 * Customer accounts (level 200): open registration with mail verification,
 * email + password sign-in, password reset. Wraps better-auth like
 * `session.ts`; errors are codes, mails go through the `Mailer`.
 */
export function accountsRoutes({
	auth,
	db,
	clientIp,
	loginThrottle,
	orchestrator,
	polar,
	panelUrl,
}: RouteDeps) {
	const ipOf = (request: Request, server: ServerLike | null) =>
		resolveClientIp({
			source: clientIp.source,
			hops: clientIp.hops,
			headers: request.headers,
			socketIp: server?.requestIP(request)?.address,
		});

	return new Elysia({
		name: "admin-api.accounts",
		prefix: "/user",
		tags: ["user"],
	})
		.use(orchestratorErrors)
		.use(polarErrors)
		.use(requireAdmin(auth))
		.post(
			"/register",
			async ({ body, request, server, status }) => {
				const ip = ipOf(request, server);
				const wait = loginThrottle.registerAttempt(ip);
				if (wait > 0) return tooManyAttempts(wait);
				const email = body.email.trim();
				if (!email || body.password.length < MIN_PASSWORD) {
					return status(400, { error: "weak_credentials", min: MIN_PASSWORD });
				}
				try {
					await auth.api.signUpEmail({
						body: {
							name: body.name?.trim() || email,
							email,
							password: body.password,
							locale: body.locale,
						},
						headers: withTrustedIp(request.headers, ip),
					});
					return { ok: true };
				} catch (error) {
					if (error instanceof APIError) {
						return status(400, { error: "signup_failed" });
					}
					throw error;
				}
			},
			{
				body: UserRegistration,
				response: { 200: Ok, 400: ApiError, 429: ApiError },
				detail: {
					summary: "Register a customer account",
					description:
						"Open. Sends a verification mail; the account can sign in after the link is opened. `weak_credentials` (400, with `min`). A taken email answers `{ ok: true }` like a new one (better-auth hides which emails exist) and changes nothing.",
				},
			},
		)
		.post(
			"/login",
			async ({ body, request, server, status }) => {
				const email = body.email.trim();
				if (!email || !body.password) {
					return status(400, { error: "missing_credentials" });
				}
				const ip = ipOf(request, server);
				const wait = loginThrottle.loginRetryAfter(ip, email);
				if (wait > 0) return tooManyAttempts(wait);
				// Staff sign in with a token only, whatever credentials an old row may still have.
				const found = await findByEmail(db, email);
				if (found && isStaff(found.level)) {
					loginThrottle.loginFailed(ip, email);
					return status(400, { error: "invalid_credentials" });
				}
				try {
					const { headers } = await auth.api.signInEmail({
						body: { email, password: body.password },
						headers: withTrustedIp(request.headers, ip),
						returnHeaders: true,
					});
					loginThrottle.loginSucceeded(email);
					return withCookies({ ok: true }, headers);
				} catch (error) {
					if (error instanceof APIError) {
						if (error.statusCode === 403) {
							return status(403, { error: "email_not_verified" });
						}
						loginThrottle.loginFailed(ip, email);
						return status(400, { error: "invalid_credentials" });
					}
					throw error;
				}
			},
			{
				body: UserLogin,
				response: { 200: Ok, 400: ApiError, 403: ApiError, 429: ApiError },
				detail: {
					summary: "Customer sign-in",
					description:
						"Sets the session cookie. `email_not_verified` (403) re-sends the verification mail. Staff accounts are always `invalid_credentials`. Throttled like the old password login (429).",
				},
			},
		)
		.get(
			"/verify",
			async ({ query }) => {
				let verified = false;
				try {
					await auth.api.verifyEmail({ query: { token: query.token } });
					verified = true;
				} catch (error) {
					if (!(error instanceof APIError)) throw error;
				}
				return Response.redirect(
					`${panelUrl}/user/login?verified=${verified ? 1 : 0}`,
					302,
				);
			},
			{
				query: t.Object({ token: t.String() }),
				detail: {
					summary: "Open the link of the verification mail",
					description:
						"Redirects to `/user/login?verified=1` (or `=0` for a bad or expired token).",
				},
			},
		)
		.post(
			"/resend",
			async ({ body, request, server }) => {
				const ip = ipOf(request, server);
				const wait = loginThrottle.registerAttempt(ip);
				if (wait > 0) return tooManyAttempts(wait);
				try {
					// better-auth answers the same for unknown and verified emails; the mail cooldown lives in auth.ts.
					await auth.api.sendVerificationEmail({
						body: { email: body.email.trim() },
					});
				} catch (error) {
					if (!(error instanceof APIError)) throw error;
				}
				return { ok: true };
			},
			{
				body: ForgotInput,
				response: { 200: Ok, 429: ApiError },
				detail: {
					summary: "Send the verification mail again",
					description:
						"Always `{ ok: true }`: nothing is sent for an unknown or already verified email, nor within a minute of the last mail to it. Counts against the per-IP registration budget.",
				},
			},
		)
		.post(
			"/forgot",
			async ({ body, request, server, status }) => {
				const ip = ipOf(request, server);
				const wait = loginThrottle.registerAttempt(ip);
				if (wait > 0) return tooManyAttempts(wait);
				try {
					await auth.api.requestPasswordReset({
						body: {
							email: body.email.trim(),
							redirectTo: `${panelUrl}/user/reset`,
						},
					});
				} catch (error) {
					if (!(error instanceof APIError)) throw error;
					return status(400, { error: "invalid_email" });
				}
				// Same answer for known and unknown emails.
				return { ok: true };
			},
			{
				body: ForgotInput,
				response: { 200: Ok, 400: ApiError, 429: ApiError },
				detail: {
					summary: "Send a password reset mail",
					description:
						"Always `{ ok: true }` for a well-formed email, registered or not. Counts against the per-IP registration budget.",
				},
			},
		)
		.post(
			"/reset",
			async ({ body, status }) => {
				if (body.password.length < MIN_PASSWORD) {
					return status(400, { error: "weak_password", min: MIN_PASSWORD });
				}
				try {
					await auth.api.resetPassword({
						body: { token: body.token, newPassword: body.password },
					});
					return { ok: true };
				} catch (error) {
					if (error instanceof APIError) {
						return status(400, { error: "invalid_token" });
					}
					throw error;
				}
			},
			{
				body: ResetInput,
				response: { 200: Ok, 400: ApiError },
				detail: {
					summary: "Set a new password with the mailed token",
					description:
						"`invalid_token` (400) for a used, expired or unknown token. Drops the account's other sessions.",
				},
			},
		)
		.guard({ account: true }, (app) =>
			app
				.get("/me", ({ account }) => toMe(account), {
					response: { 200: Me, 401: ApiError },
					detail: {
						summary: "The signed-in account (staff or user)",
						description:
							"`lastActiveAt` is epoch ms or null; a user account is deleted after 180 days without activity.",
					},
				})
				.patch(
					"/me",
					async ({ body, account, request, status }) => {
						if (isStaff(account.level)) {
							return status(403, { error: "forbidden" });
						}
						const name = body.name.trim();
						if (!name) return status(400, { error: "invalid_name" });
						await auth.api.updateUser({
							headers: request.headers,
							body: { name },
						});
						return toMe({ ...account, name });
					},
					{
						body: UpdateMeInput,
						response: { 200: Me, 400: ApiError, 401: ApiError, 403: ApiError },
						detail: {
							summary: "Change the own display name (users)",
							description:
								"Users only (staff: `forbidden`, 403). Blank name: `invalid_name` (400).",
						},
					},
				)
				.post(
					"/me/email",
					async ({ body, account, request, server, status }) => {
						if (isStaff(account.level)) {
							return status(403, { error: "forbidden" });
						}
						const email = body.email.trim().toLowerCase();
						if (!isEmail(email)) return status(400, { error: "invalid_email" });
						if (email === account.email.toLowerCase()) {
							return status(400, { error: "same_email" });
						}
						const wait = loginThrottle.registerAttempt(ipOf(request, server));
						if (wait > 0) return tooManyAttempts(wait);
						try {
							await auth.api.changeEmail({
								headers: request.headers,
								body: { newEmail: email },
							});
						} catch (error) {
							if (error instanceof APIError) {
								return status(400, { error: "invalid_email" });
							}
							throw error;
						}
						// Also `{ ok: true }` for an address that is taken (better-auth sends nothing then), so emails cannot be probed.
						return { ok: true };
					},
					{
						body: ChangeEmailInput,
						response: {
							200: Ok,
							400: ApiError,
							401: ApiError,
							403: ApiError,
							429: ApiError,
						},
						detail: {
							summary: "Start an email change (users)",
							description:
								"Mails a verification link to the NEW address; the account's email changes only after the link (`/api/user/verify`) is opened. Users only (staff: `forbidden`, 403). `invalid_email`, `same_email` (400). A taken address answers `{ ok: true }` and sends nothing. Counts against the per-IP registration budget (429).",
						},
					},
				)
				.delete(
					"/me",
					async ({ body, account, status }) => {
						if (isStaff(account.level)) {
							return status(403, { error: "forbidden" });
						}
						if (
							body.confirmEmail.trim().toLowerCase() !==
							account.email.toLowerCase()
						) {
							return status(400, { error: "confirm_mismatch" });
						}
						// Plan and channels first: if Polar or the orchestrator is down this throws (502/503) and the account stays.
						await deleteAccount(
							{ db, orchestrator, polar },
							account.id,
							account.id,
						);
						return { ok: true };
					},
					{
						body: DeleteMeInput,
						response: {
							200: Ok,
							400: ApiError,
							401: ApiError,
							403: ApiError,
							502: ApiError,
							503: ApiError,
						},
						detail: {
							summary: "Delete the own account (users)",
							description:
								"`confirmEmail` must equal the account email (`confirm_mismatch`, 400). Deletes the account, its sessions and its channels with their visitors' data. When the orchestrator cannot delete the channels the answer is 502/503 and the account is kept. Users only (staff: `forbidden`, 403).",
						},
					},
				),
		);
}

/** The `Me` body of an account. */
function toMe(account: {
	id: string;
	name: string;
	email: string;
	level: number;
	lastActiveAt?: Date | null;
}) {
	return {
		id: account.id,
		name: account.name,
		email: account.email,
		level: account.level,
		lastActiveAt: account.lastActiveAt?.getTime() ?? null,
	};
}
