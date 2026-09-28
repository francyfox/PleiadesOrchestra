import { defineConfig } from "drizzle-kit";

// Migrations only — generated from the better-auth schema, applied at startup
// by `src/lib/server/db/index.ts`. No credentials needed to generate.
export default defineConfig({
	dialect: "sqlite",
	schema: "./src/lib/server/db/auth-schema.ts",
	out: "./drizzle",
});
