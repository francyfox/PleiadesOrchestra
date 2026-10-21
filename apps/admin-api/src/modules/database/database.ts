import { Database } from "bun:sqlite";
import { type BunSQLiteDatabase, drizzle } from "drizzle-orm/bun-sqlite";
import { migrate } from "drizzle-orm/bun-sqlite/migrator";
import * as authSchema from "./database.auth-schema.ts";
import { accountNotices } from "./database.notices-schema.ts";

const schema = { ...authSchema, accountNotices };

export type AdminDb = BunSQLiteDatabase<typeof schema> & { $client: Database };

/**
 * Opens the admin app's own SQLite (better-auth accounts only — chat data
 * lives in the orchestrator) and applies pending migrations.
 */
export function openAdminDb(path: string, migrationsFolder: string): AdminDb {
	const sqlite = new Database(path, { create: true });
	sqlite.run("PRAGMA journal_mode = WAL");
	sqlite.run("PRAGMA foreign_keys = ON");
	sqlite.run("PRAGMA busy_timeout = 5000");
	const db = drizzle(sqlite, { schema });
	migrate(db, { migrationsFolder });
	return db;
}

export { schema };
