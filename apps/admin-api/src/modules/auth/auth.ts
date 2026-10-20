import { type BetterAuthPlugin, betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { admin } from "better-auth/plugins";
import { accountFields, isStaff } from "../accounts/accounts.schema.ts";
import { MIN_PASSWORD } from "../admin-policy/admin-policy.service.ts";
import { TRUSTED_IP_HEADER } from "../client-ip/client-ip.service.ts";
import { type AdminDb, schema } from "../database/database.ts";
import { buildMail, isEmailChangeToken } from "../mail/mail.service.ts";
import type { Mailer } from "../mail/mail.types.ts";
import { staffToken } from "../staff-token/staff-token.ts";

export interface AuthOptions {
	db: AdminDb;
	secret: string;
	baseURL: string;
	/** Origins better-auth accepts besides `baseURL` (e.g. the 127.0.0.1 alias of localhost). */
	trustedOrigins?: string[];
	mailer: Mailer;
	/** Origin the panel is opened at; the links in mails point there. */
	panelUrl: string;
	extraPlugins?: BetterAuthPlugin[];
}

/**
 * better-auth for all accounts: staff (level 0/100, sign in with an access
 * token, no password) and users (level 200, email + password, verified by
 * mail). Sessions are the same for both; `level` decides what they may call.
 */
export function createAuth({
	db,
	secret,
	baseURL,
	trustedOrigins,
	mailer,
	panelUrl,
	extraPlugins = [],
}: AuthOptions) {
	return betterAuth({
		secret,
		baseURL,
		trustedOrigins,
		telemetry: { enabled: false },
		database: drizzleAdapter(db, { provider: "sqlite", schema }),
		user: {
			additionalFields: accountFields,
			// The new address gets the verification link; the email changes only once it is opened.
			changeEmail: { enabled: true },
		},
		emailAndPassword: {
			enabled: true,
			minPasswordLength: MIN_PASSWORD,
			requireEmailVerification: true,
			revokeSessionsOnPasswordReset: true,
			sendResetPassword: async ({ user, token }) => {
				// Staff have no password to reset.
				if (isStaff((user as { level?: number }).level ?? 200)) return;
				void mailer.send(
					buildMail(
						"reset",
						user.email,
						`${panelUrl}/user/reset?token=${token}`,
						(user as { locale?: string | null }).locale,
					),
				);
			},
		},
		emailVerification: {
			sendOnSignUp: true,
			// A sign-in with the right password but an unverified email gets a fresh link (the old one lives an hour).
			sendOnSignIn: true,
			sendVerificationEmail: async ({ user, token }) => {
				void mailer.send(
					buildMail(
						// better-auth reuses this hook for a changed address; its token then carries `updateTo`.
						isEmailChangeToken(token) ? "email-change" : "verify",
						user.email,
						`${panelUrl}/api/user/verify?token=${token}`,
						(user as { locale?: string | null }).locale,
					),
				);
			},
		},
		// better-auth would otherwise trust a client-sent X-Forwarded-For for
		// session.ipAddress. Routes overwrite this header with the IP resolved
		// from CLIENT_IP_SOURCE (see client-ip.service.ts); nothing else is read.
		advanced: { ipAddress: { ipAddressHeaders: [TRUSTED_IP_HEADER] } },
		databaseHooks: {
			user: {
				create: {
					// The admin plugin's `role` only gates its ban/session endpoints: staff are "admin".
					before: async (user) => {
						const level = (user as { level?: number }).level ?? 200;
						return {
							data: { ...user, role: isStaff(level) ? "admin" : "user" },
						};
					},
				},
			},
		},
		plugins: [admin(), staffToken(), ...extraPlugins],
	});
}

export type Auth = ReturnType<typeof createAuth>;
