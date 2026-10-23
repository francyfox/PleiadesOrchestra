import { expect, test } from "bun:test";
import { INTENT_SET_IDS } from "admin-api/forms";
import { INTENT_SET_CATALOG, intentSetCodeUrl } from "./intent-set-catalog.ts";

const root = `${import.meta.dir}/../../../..`;

test("every set id has exactly one catalog entry, and its file exists", async () => {
	expect(INTENT_SET_CATALOG.map((set) => set.id).sort()).toEqual(
		[...INTENT_SET_IDS].sort(),
	);
	for (const set of INTENT_SET_CATALOG) {
		expect(await Bun.file(`${root}/${set.file}`).exists()).toBe(true);
	}
});

test("the link is a GitHub blob URL of the file, without a line", () => {
	expect(intentSetCodeUrl({ id: "shop", file: "a/b.ts" })).toBe(
		"https://github.com/francyfox/PleiadesOrchestra/blob/master/a/b.ts",
	);
});
