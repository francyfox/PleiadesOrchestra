import { defineConfig } from "drizzle-kit";

// Generates SQL migrations only (`bun run db:generate`) — they're applied at
// startup by `migrate()` in src/db/client.ts, not by drizzle-kit.
export default defineConfig({
	dialect: "sqlite",
	schema: "./src/db/schema.ts",
	out: "./drizzle",
});
