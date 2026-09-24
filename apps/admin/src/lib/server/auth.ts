import { type BetterAuthPlugin, betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { APIError, createAuthMiddleware } from "better-auth/api";
import { admin } from "better-auth/plugins";
import { type AdminDb, countAdmins, schema } from "./db";

export interface AuthOptions {
	db: AdminDb;
	secret: string;
	baseURL: string;
	/** Appended last — `sveltekitCookies` must be the final plugin. */
	extraPlugins?: BetterAuthPlugin[];
}

/**
 * better-auth for admin accounts. Only one role exists in this database:
 * every account is an admin (chat users live in the orchestrator, not here).
 * Public sign-up only works while no account exists — it bootstraps the
 * first admin; afterwards admins are created by admins via `createUser`.
 * Kept free of SvelteKit imports so tests can build it directly.
 */
export function createAuth({
	db,
	secret,
	baseURL,
	extraPlugins = [],
}: AuthOptions) {
	return betterAuth({
		secret,
		baseURL,
		telemetry: { enabled: false },
		database: drizzleAdapter(db, { provider: "sqlite", schema }),
		emailAndPassword: { enabled: true, autoSignIn: true },
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
