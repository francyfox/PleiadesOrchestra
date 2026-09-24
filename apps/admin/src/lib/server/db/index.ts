import { Database } from "bun:sqlite";
import { count, eq, isNull, or } from "drizzle-orm";
import { type BunSQLiteDatabase, drizzle } from "drizzle-orm/bun-sqlite";
import { migrate } from "drizzle-orm/bun-sqlite/migrator";
import * as schema from "./auth-schema";

export type AdminDb = BunSQLiteDatabase<typeof schema>;

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

/** Every account in this database is an admin (see `auth.ts`). */
export async function countAdmins(db: AdminDb): Promise<number> {
	const [row] = await db.select({ value: count() }).from(schema.user);
	return row?.value ?? 0;
}

export async function countActiveAdmins(db: AdminDb): Promise<number> {
	const [row] = await db
		.select({ value: count() })
		.from(schema.user)
		.where(or(isNull(schema.user.banned), eq(schema.user.banned, false)));
	return row?.value ?? 0;
}

export { schema };
