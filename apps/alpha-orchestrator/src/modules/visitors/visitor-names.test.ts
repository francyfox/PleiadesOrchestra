import { expect, test } from "bun:test";
import { eq } from "drizzle-orm";
import { visitors } from "../database/database.schema.ts";
import { testDb } from "../database/database.testing.ts";
import ADJECTIVES from "./visitor-names.adjectives.json";
import ANIMALS from "./visitor-names.animals.json";
import { generateVisitorName } from "./visitor-names.ts";
import {
	backfillVisitorNames,
	upsertIdentifiedVisitor,
} from "./visitors.service.ts";

test("a name is adjective_animal_xxxxxx in lowercase ascii", () => {
	for (let i = 0; i < 500; i++) {
		expect(generateVisitorName()).toMatch(/^[a-z]+_[a-z]+_[a-z0-9]{6}$/);
	}
});

test("the word lists hold distinct lowercase ascii words", () => {
	for (const words of [ADJECTIVES, ANIMALS]) {
		for (const word of words) expect(word).toMatch(/^[a-z]+$/);
		expect(new Set(words).size).toBe(words.length);
	}
});

test("names are not unique, and identical names do not break inserts", () => {
	const db = testDb();
	const a = upsertIdentifiedVisitor(db, "ch_cli", "1", undefined, 1);
	const b = upsertIdentifiedVisitor(db, "ch_cli", "2", undefined, 1);
	db.update(visitors).set({ name: a.name }).where(eq(visitors.id, b.id)).run();
	const c = upsertIdentifiedVisitor(db, "ch_cli", "3", undefined, 1);
	expect(db.select().from(visitors).all()).toHaveLength(3);
	expect(c.name).not.toBe("");
});

test("an identified visitor keeps displayName and also has a name; re-identifying keeps the name", () => {
	const db = testDb();
	const first = upsertIdentifiedVisitor(db, "ch_cli", "1", "Ivan", 1);
	const again = upsertIdentifiedVisitor(db, "ch_cli", "1", "Ivan P.", 2);
	expect(again.displayName).toBe("Ivan P.");
	expect(again.name).toBe(first.name);
	expect(first.name).toMatch(/^[a-z]+_[a-z]+_[a-z0-9]{6}$/);
});

test("backfill names rows that have none, leaves named rows alone, and is a no-op the second time", () => {
	const db = testDb();
	const named = upsertIdentifiedVisitor(db, "ch_cli", "1", undefined, 1);
	const bare = upsertIdentifiedVisitor(db, "ch_cli", "2", undefined, 1);
	db.update(visitors).set({ name: "" }).where(eq(visitors.id, bare.id)).run();

	expect(backfillVisitorNames(db)).toBe(1);
	const after = db
		.select()
		.from(visitors)
		.where(eq(visitors.id, bare.id))
		.get();
	expect(after?.name).toMatch(/^[a-z]+_[a-z]+_[a-z0-9]{6}$/);
	expect(
		db.select().from(visitors).where(eq(visitors.id, named.id)).get()?.name,
	).toBe(named.name);
	expect(backfillVisitorNames(db)).toBe(0);
});
