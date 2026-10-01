import { defineConfig } from "drizzle-kit";

// Migrations only — generated from the better-auth schema and applied at
// startup by `openAdminDb` (src/modules/database/database.ts).
export default defineConfig({
	dialect: "sqlite",
	schema: "./src/modules/database/database.auth-schema.ts",
	out: "./drizzle",
});
