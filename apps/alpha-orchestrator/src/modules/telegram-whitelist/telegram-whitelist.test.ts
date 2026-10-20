import { describe, expect, test } from "bun:test";
import { eq } from "drizzle-orm";
import { visitors } from "../database/database.schema.ts";
import { testDb } from "../database/database.testing.ts";
import { upsertIdentifiedVisitor } from "../visitors/visitors.service.ts";
import {
	importTelegramWhitelist,
	parseIds,
} from "./telegram-whitelist.service.ts";

describe("parseIds", () => {
	test("splits, trims, drops empties and duplicates", () => {
		expect(parseIds(" 1, 2,,2 ,3")).toEqual(["1", "2", "3"]);
	});

	test("rejects non-numeric ids", () => {
		expect(() => parseIds("1,abc")).toThrow(/abc/);
	});
});

describe("importTelegramWhitelist", () => {
	test("creates missing visitors and whitelists existing ones, keeping an earlier whitelistedAt", () => {
		const db = testDb();
		upsertIdentifiedVisitor(db, "ch_telegram", "1", "Known", 5);
		const existing = upsertIdentifiedVisitor(
			db,
			"ch_telegram",
			"2",
			undefined,
			5,
		);
		db.update(visitors)
			.set({ whitelistedAt: 3 })
			.where(eq(visitors.id, existing.id))
			.run();

		expect(importTelegramWhitelist(db, ["1", "2", "3"], 100)).toBe(3);

		const rows = db.select().from(visitors).all();
		const byExternal = Object.fromEntries(
			rows.map((r) => [r.externalUserId, r]),
		);
		expect(byExternal["1"]).toMatchObject({
			displayName: "Known",
			whitelistedAt: 100,
			whitelistedBy: "import:ALLOWED_TELEGRAM_USER_IDS",
		});
		expect(byExternal["2"]?.whitelistedAt).toBe(3);
		expect(byExternal["3"]).toMatchObject({
			kind: "identified",
			whitelistedAt: 100,
		});
	});
});
