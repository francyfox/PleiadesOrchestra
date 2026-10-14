import { type BetterAuthPlugin, betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { APIError, createAuthMiddleware } from "better-auth/api";
import { admin } from "better-auth/plugins";
import { MIN_PASSWORD } from "../admin-policy/admin-policy.service.ts";
import { countAdmins } from "../admins/admins.service.ts";
import { TRUSTED_IP_HEADER } from "../client-ip/client-ip.service.ts";
import { type AdminDb, schema } from "../database/database.ts";

export interface AuthOptions {
	db: AdminDb;
	secret: string;
	baseURL: string;
	/** Origins better-auth accepts besides `baseURL` (e.g. the 127.0.0.1 alias of localhost). */
	trustedOrigins?: string[];
	extraPlugins?: BetterAuthPlugin[];
}

/**
 * better-auth for admin accounts. Only one role exists in this database:
 * every account is an admin (chat users live in the orchestrator, not here).
 * Public sign-up only works while no account exists — it bootstraps the
 * first admin; afterwards admins are created by admins via `createUser`.
 */
export function createAuth({
	db,
	secret,
	baseURL,
	trustedOrigins,
	extraPlugins = [],
}: AuthOptions) {
	return betterAuth({
		secret,
		baseURL,
		trustedOrigins,
		telemetry: { enabled: false },
		database: drizzleAdapter(db, { provider: "sqlite", schema }),
		emailAndPassword: {
			enabled: true,
			autoSignIn: true,
			minPasswordLength: MIN_PASSWORD,
		},
		// better-auth would otherwise trust a client-sent X-Forwarded-For for
		// session.ipAddress. Routes overwrite this header with the IP resolved
		// from CLIENT_IP_SOURCE (see client-ip.service.ts); nothing else is read.
		advanced: { ipAddress: { ipAddressHeaders: [TRUSTED_IP_HEADER] } },
		hooks: {
			// Closed at the API level, not just the /register page — otherwise a
			// direct POST would still create accounts.
			before: createAuthMiddleware(async (ctx) => {
				if (ctx.path === "/sign-up/email" && (await countAdmins(db)) > 0) {
					throw new APIError("FORBIDDEN", {
						message: "Registration is closed",
					});
				}
			}),
		},
		databaseHooks: {
			user: {
				create: {
					before: async (user) => ({ data: { ...user, role: "admin" } }),
				},
			},
		},
		plugins: [admin(), ...extraPlugins],
	});
}

export type Auth = ReturnType<typeof createAuth>;
