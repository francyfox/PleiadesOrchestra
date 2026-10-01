import { defineConfig } from "drizzle-kit";

// Generates SQL migrations only (`bun run db:generate`) — they're applied at
// startup by `migrate()` in src/modules/database/database.ts, not by drizzle-kit.
export default defineConfig({
	dialect: "sqlite",
	schema: "./src/modules/database/database.schema.ts",
	out: "./drizzle",
});
