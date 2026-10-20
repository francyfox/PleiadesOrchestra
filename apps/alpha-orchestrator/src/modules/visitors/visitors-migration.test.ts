import { expect, test } from "bun:test";
import { cpSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DEFAULT_MIGRATIONS_DIR, openDatabase } from "../database/database.ts";
import { backfillVisitorNames } from "./visitors.service.ts";

test("0019 renames users to visitors in place: rows, threads and FKs survive, names are backfilled", () => {
	// Old schema = the migrations folder without 0019.
	const old = mkdtempSync(join(tmpdir(), "po-mig-"));
	cpSync(DEFAULT_MIGRATIONS_DIR, old, { recursive: true });
	const journalPath = join(old, "meta/_journal.json");
	const journal = JSON.parse(readFileSync(journalPath, "utf8"));
	journal.entries = journal.entries.slice(
		0,
		journal.entries.findIndex(
			(e: { tag: string }) => e.tag === "0019_visitors",
		),
	);
	writeFileSync(journalPath, JSON.stringify(journal));

	const path = join(old, "test.db");
	const before = openDatabase(path, old);
	before.$client.run(
		"INSERT INTO users (id, channel_id, kind, created_at, last_seen_at) VALUES ('u1', 'ch_cli', 'anonymous', 1, 1)",
	);
	before.$client.run(
		"INSERT INTO threads (id, user_id, channel_id, created_at) VALUES ('t1', 'u1', 'ch_cli', 1)",
	);
	before.$client.close();

	const db = openDatabase(path, DEFAULT_MIGRATIONS_DIR);
	expect(
		db.$client.query("SELECT visitor_id FROM threads WHERE id = 't1'").get(),
	).toEqual({ visitor_id: "u1" });
	expect(backfillVisitorNames(db)).toBe(1);
	expect(
		(db.$client.query("SELECT name FROM visitors").get() as { name: string })
			.name,
	).toMatch(/^[a-z]+_[a-z]+_[a-z0-9]{6}$/);
	// The FK follows the rename: deleting the visitor cascades to its thread.
	db.$client.run("DELETE FROM visitors WHERE id = 'u1'");
	expect(db.$client.query("SELECT id FROM threads").all()).toEqual([]);
	db.$client.close();
});
