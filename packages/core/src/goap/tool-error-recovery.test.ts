import { describe, expect, test } from "bun:test";
import { recoveryFromToolError } from "#core/goap/tool-error-recovery";

const KNOWN = [
	{ name: "choose_store", intent: "chooseStore" as const },
	{ name: "add_recipe_to_cart", intent: "addToCart" as const },
	{ name: "select_city", intent: "other" as const },
	{ name: "open_page", intent: "navigate" as const },
];

describe("recoveryFromToolError", () => {
	test("a named tool of another intent: its effects are invalidated", () => {
		const recovery = recoveryFromToolError(
			"No store is open yet. Call choose_store first with one of: Greenleaf Market, Harbor Foods Co-op, Penny Pantry.",
			"add_recipe_to_cart",
			KNOWN,
		);
		expect(recovery).toEqual({
			tool: "choose_store",
			facts: {
				storeOpen: false,
				"toolResult:choose_store": undefined,
				"webmcp:choose_store:result": undefined,
			},
		});
	});

	test("another domain: a booking site asking for select_city", () => {
		const recovery = recoveryFromToolError(
			"Pick a city before booking. Call select_city first.",
			"book_table",
			[
				{ name: "select_city", intent: "chooseStore" },
				{ name: "book_table", intent: "addToCart" },
			],
		);
		expect(recovery?.tool).toBe("select_city");
		expect(recovery?.facts.storeOpen).toBe(false);
	});

	test("the failed tool itself, a longer name sharing a prefix, or no name: no recovery", () => {
		expect(
			recoveryFromToolError(
				"add_recipe_to_cart failed",
				"add_recipe_to_cart",
				KNOWN,
			),
		).toBeUndefined();
		expect(
			recoveryFromToolError("Call choose_store_v2 first", "x", KNOWN),
		).toBeUndefined();
		expect(
			recoveryFromToolError("Something went wrong", "x", KNOWN),
		).toBeUndefined();
	});

	test("a named tool with no intent effects cannot be routed to by the planner: no recovery", () => {
		expect(
			recoveryFromToolError("Call select_city first.", "x", KNOWN),
		).toBeUndefined();
	});

	test("with several names, the one mentioned first wins", () => {
		const recovery = recoveryFromToolError(
			"Call open_page first, then choose_store",
			"add_recipe_to_cart",
			KNOWN,
		);
		expect(recovery?.tool).toBe("open_page");
		expect(recovery?.facts.pageOpened).toBe(false);
	});
});
