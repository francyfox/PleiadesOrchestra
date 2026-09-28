import { Database } from "bun:sqlite";
import { asc, count, eq, isNull, or } from "drizzle-orm";
import { type BunSQLiteDatabase, drizzle } from "drizzle-orm/bun-sqlite";
import { migrate } from "drizzle-orm/bun-sqlite/migrator";
import * as schema from "./auth-schema";

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

/**
 * The super admin is whoever registered first — derived from `createdAt`, so
 * there is nothing to migrate and nothing to forge. null on a fresh install.
 */
export async function superAdminId(db: AdminDb): Promise<string | null> {
	const [row] = await db
		.select({ id: schema.user.id })
		.from(schema.user)
		.orderBy(asc(schema.user.createdAt), asc(schema.user.id))
		.limit(1);
	return row?.id ?? null;
}

export { schema };

export async function findAdmin(db: AdminDb, id: string) {
	const [row] = await db
		.select()
		.from(schema.user)
		.where(eq(schema.user.id, id));
	return row ?? null;
}

/**
 * Whether first-run registration is over. Cached once true — it can't go
 * back, since the last active admin can't be banned (see `admin-policy.ts`).
 */
export function createSetupGate(db: AdminDb) {
	let adminExists = false;
	return {
		async hasAdmin(): Promise<boolean> {
			if (!adminExists) adminExists = (await countAdmins(db)) > 0;
			return adminExists;
		},
	};
}
