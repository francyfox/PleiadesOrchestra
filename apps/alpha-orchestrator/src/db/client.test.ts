import { expect, test } from "bun:test";
import { testDb } from "../test/db.ts";
import { channels } from "./schema.ts";

test("migrations seed the built-in telegram (whitelist) and cli (open) channels", () => {
	const db = testDb();
	const rows = db
		.select({ slug: channels.slug, accessMode: channels.accessMode })
		.from(channels)
		.all();
	expect(rows).toEqual(
		expect.arrayContaining([
			{ slug: "telegram", accessMode: "whitelist" },
			{ slug: "cli", accessMode: "open" },
		]),
	);
});

test("foreign keys are enforced", () => {
	const db = testDb();
	expect(db.$client.query("PRAGMA foreign_keys").get()).toEqual({
		foreign_keys: 1,
	});
});
