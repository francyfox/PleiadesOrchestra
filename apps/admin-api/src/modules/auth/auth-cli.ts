/**
 * Config used only by `bun run auth:schema` (`@better-auth/cli generate`) to
 * regenerate `modules/database/database.auth-schema.ts` — keep plugins in sync with `modules/auth/auth.ts`.
 */
import { Database } from "bun:sqlite";
import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { admin } from "better-auth/plugins";
import { drizzle } from "drizzle-orm/bun-sqlite";

export const auth = betterAuth({
	database: drizzleAdapter(drizzle(new Database(":memory:")), {
		provider: "sqlite",
	}),
	emailAndPassword: { enabled: true },
	plugins: [admin()],
});
