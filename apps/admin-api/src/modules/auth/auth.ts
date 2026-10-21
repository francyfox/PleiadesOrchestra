import { type BetterAuthPlugin, betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { createEmailVerificationToken } from "better-auth/api";
import { admin } from "better-auth/plugins";
import { accountFields, isStaff } from "../accounts/accounts.schema.ts";
import { MIN_PASSWORD } from "../admin-policy/admin-policy.service.ts";
import { TRUSTED_IP_HEADER } from "../client-ip/client-ip.service.ts";
import { type AdminDb, schema } from "../database/database.ts";
import {
	buildMail,
	createMailCooldown,
	isEmailChangeToken,
	MAIL_COOLDOWN_MS,
} from "../mail/mail.service.ts";
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
	now?: () => number;
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
	now = Date.now,
}: AuthOptions) {
	// Every path that mails a link (sign-up, sign-up again, sign-in, resend, forgot) shares it: no mail bombing.
	const mayMail = createMailCooldown(MAIL_COOLDOWN_MS, now);
	const sendVerification = (
		user: { email: string; locale?: string | null; level?: number },
		token: string,
	): void => {
		// better-auth reuses this hook for a changed address; its token then carries `updateTo`.
		const kind = isEmailChangeToken(token) ? "email-change" : "verify";
		// Staff sign in with a token: a "confirm your email" link means nothing to them.
		if (kind === "verify" && isStaff(user.level ?? 200)) return;
		if (!mayMail(`verify:${user.email.toLowerCase()}`)) return;
		void mailer.send(
			buildMail(
				kind,
				user.email,
				`${panelUrl}/api/user/verify?token=${token}`,
				user.locale,
			),
		);
	};

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
			// Signing up again with a still unverified email sends a fresh link (the answer stays the generic one).
			onExistingUserSignUp: async ({ user }) => {
				if (user.emailVerified) return;
				sendVerification(
					user,
					await createEmailVerificationToken(secret, user.email),
				);
			},
			sendResetPassword: async ({ user, token }) => {
				// Staff have no password to reset.
				if (isStaff((user as { level?: number }).level ?? 200)) return;
				if (!mayMail(`reset:${user.email.toLowerCase()}`)) return;
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
			sendVerificationEmail: async ({ user, token }) =>
				sendVerification(user, token),
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
