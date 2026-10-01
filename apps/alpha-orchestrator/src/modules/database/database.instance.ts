import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { config } from "../config/config.service.ts";
import { DEFAULT_MIGRATIONS_DIR, openDatabase } from "./database.ts";

// Runtime singleton — only runtime code imports this file. Tests build their
// own in-memory database with `testDb()`.
if (config.DATABASE_PATH !== ":memory:") {
	mkdirSync(dirname(config.DATABASE_PATH), { recursive: true });
}

export const db = openDatabase(
	config.DATABASE_PATH,
	config.DATABASE_MIGRATIONS_DIR ?? DEFAULT_MIGRATIONS_DIR,
);
