import { type Db, DEFAULT_MIGRATIONS_DIR, openDatabase } from "../db/client.ts";

/** Fresh in-memory database with the real migrations applied. */
export function testDb(): Db {
	return openDatabase(":memory:", DEFAULT_MIGRATIONS_DIR);
}
