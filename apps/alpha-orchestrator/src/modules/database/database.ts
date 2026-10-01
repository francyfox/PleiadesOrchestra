import { Database } from "bun:sqlite";
import { type BunSQLiteDatabase, drizzle } from "drizzle-orm/bun-sqlite";
import { migrate } from "drizzle-orm/bun-sqlite/migrator";
import { schema } from "./database.schema.ts";

export type Db = BunSQLiteDatabase<typeof schema> & { $client: Database };

/** Migrations checked into the repo, relative to this file — used by tests and `bun src/index.ts`. */
export const DEFAULT_MIGRATIONS_DIR = new URL(
	"../../../drizzle",
	import.meta.url,
).pathname;

/**
 * Opens the SQLite database and applies migrations. `path` may be
 * `":memory:"` (tests). The migrations folder is read from disk at runtime
 * — it is *not* embedded into the `--compile` binary, so the Docker image
 * ships it next to the binary (see the Dockerfile).
 */
export function openDatabase(path: string, migrationsDir: string): Db {
	const sqlite = new Database(path, { create: true, strict: true });
	sqlite.run("PRAGMA journal_mode = WAL;");
	sqlite.run("PRAGMA foreign_keys = ON;");
	sqlite.run("PRAGMA busy_timeout = 5000;");
	const db = drizzle({ client: sqlite, schema });
	migrate(db, { migrationsFolder: migrationsDir });
	return db;
}
