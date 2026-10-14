import { Database } from "bun:sqlite";
import { expect, test } from "bun:test";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { buildInitSql, dumpSql, schemaObjects } from "./database.snapshot.ts";
import { openAdminDb } from "./database.ts";

const MIGRATIONS = join(import.meta.dir, "../../../drizzle");
const INIT_SQL = join(MIGRATIONS, "init.sql");

function withTmp<T>(fn: (dir: string) => T): T {
	const dir = mkdtempSync(join(tmpdir(), "init-sql-"));
	try {
		return fn(dir);
	} finally {
		rmSync(dir, { recursive: true, force: true });
	}
}

function fromInitSql(path: string): void {
	const db = new Database(path, { create: true });
	db.exec(readFileSync(INIT_SQL, "utf8"));
	db.close();
}

test("drizzle/init.sql is up to date (run `bun run db:snapshot`)", () => {
	expect(
		readFileSync(INIT_SQL, "utf8"),
		"drizzle/init.sql is stale: run `bun run db:snapshot`",
	).toBe(buildInitSql(MIGRATIONS));
});

test("a DB built from init.sql equals one built by the migrator", () => {
	withTmp((dir) => {
		const initPath = join(dir, "init.db");
		fromInitSql(initPath);
		const init = new Database(initPath);
		const migrated = openAdminDb(":memory:", MIGRATIONS).$client;
		expect(schemaObjects(init)).toEqual(schemaObjects(migrated));
		expect(dumpSql(init)).toBe(dumpSql(migrated));
		init.close();
	});
});

test("migrating a DB created from init.sql is a no-op", () => {
	withTmp((dir) => {
		const path = join(dir, "init.db");
		fromInitSql(path);
		const before = dumpSql(new Database(path));
		const db = openAdminDb(path, MIGRATIONS);
		expect(dumpSql(db.$client)).toBe(before);
		db.$client.close();
	});
});
