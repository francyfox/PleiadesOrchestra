import { describe, expect, test } from "bun:test";
import {
	ALL_INTENT_IDS,
	ALL_SESSION_FACTS,
	PRESET_IDS,
	PRESET_LIST,
	PRESETS,
	resolveTaxonomy,
	SHOP_TAXONOMY,
} from "./index.ts";
import { intentFromMessageCues, intentFromToolNameCues } from "./preset.ts";

describe("registry", () => {
	test("the light list of ids (for browsers) is the registry's", () => {
		expect([...PRESET_IDS].sort() as string[]).toEqual(
			Object.keys(PRESETS).sort(),
		);
		for (const { id, file } of PRESET_LIST) {
			expect(PRESETS[id]?.id).toBe(id);
			expect(
				Bun.file(`${import.meta.dir}/../../../${file}`).size,
			).toBeGreaterThan(0);
		}
	});

	test("every preset is listed under its own id", () => {
		for (const id of PRESET_IDS) expect(PRESETS[id]?.id).toBe(id);
		expect(PRESET_IDS).toContain("shop");
	});

	test("an unknown id is skipped, an empty list is an empty taxonomy", () => {
		expect(resolveTaxonomy(["gone"]).intents).toEqual({});
		expect(resolveTaxonomy(["gone", "shop"]).presets).toEqual(["shop"]);
	});
});

describe("what is known across all presets", () => {
	test("session facts and intent ids are the union, `chat` first", () => {
		expect(ALL_SESSION_FACTS).toEqual(
			expect.arrayContaining(["storeOpen", "lastProduct"]),
		);
		expect(ALL_INTENT_IDS[0]).toBe("chat");
		expect(new Set(ALL_INTENT_IDS).size).toBe(ALL_INTENT_IDS.length);
		expect(ALL_INTENT_IDS).toContain("addToCart");
	});
});

describe("shop preset", () => {
	test("has the intents the planner and the guards know", () => {
		expect(Object.keys(SHOP_TAXONOMY.intents)).toEqual([
			"chooseStore",
			"navigate",
			"search",
			"filter",
			"select",
			"addToCart",
			"removeFromCart",
			"checkout",
			"paginate",
			"compare",
			"readState",
			"other",
		]);
	});

	test("checkout and removal run only on the visitor's words; reading is a tool's role", () => {
		const guarded = Object.entries(SHOP_TAXONOMY.intents)
			.filter(([, def]) => def.needsWords)
			.map(([id]) => id);
		expect(guarded.sort()).toEqual(["checkout", "removeFromCart"]);
		expect(SHOP_TAXONOMY.intents.readState?.toolRole).toBe(true);
	});

	test("an intent is only ever required to produce facts some intent gives (no unreachable precondition)", () => {
		const given = new Set(
			Object.values(SHOP_TAXONOMY.intents).flatMap((def) =>
				Object.keys(def.effects),
			),
		);
		// `requestParsed` comes from the request parser in core, not from a tool.
		const external = new Set(["requestParsed"]);
		for (const [id, def] of Object.entries(SHOP_TAXONOMY.intents)) {
			for (const fact of Object.keys(def.preconditions)) {
				expect({ id, fact, ok: given.has(fact) || external.has(fact) }).toEqual(
					{
						id,
						fact,
						ok: true,
					},
				);
			}
		}
	});

	test("keeps the facts of a conversation and answers through its word rules", () => {
		expect(SHOP_TAXONOMY.sessionFacts).toEqual([
			"storeOpen",
			"store",
			"lastProduct",
		]);
		expect(intentFromMessageCues(SHOP_TAXONOMY, "pay for the order")).toBe(
			"checkout",
		);
		expect(
			intentFromToolNameCues(SHOP_TAXONOMY, { name: "search_products" }),
		).toBe("search");
		expect(
			SHOP_TAXONOMY.specialistPenalty("add_recipe_to_cart", "addToCart"),
		).toBeGreaterThan(0);
	});
});
