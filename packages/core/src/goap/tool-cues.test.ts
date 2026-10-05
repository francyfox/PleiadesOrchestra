import { describe, expect, test } from "bun:test";
import { intentFromToolCues, specialistPenalty } from "./tool-cues.ts";

describe("intentFromToolCues", () => {
	test("reads the intent from the tool's name", () => {
		expect(intentFromToolCues({ name: "choose_store" })).toBe("chooseStore");
		expect(intentFromToolCues({ name: "search_products" })).toBe("search");
		expect(intentFromToolCues({ name: "add_to_cart" })).toBe("addToCart");
		expect(intentFromToolCues({ name: "add_recipe_to_cart" })).toBe(
			"addToCart",
		);
		expect(intentFromToolCues({ name: "start_checkout" })).toBe("checkout");
		expect(intentFromToolCues({ name: "remove_from_cart" })).toBe(
			"removeFromCart",
		);
		expect(intentFromToolCues({ name: "compare_products" })).toBe("compare");
	});

	test("a tool that only reads or only edits settings produces no shop effect: other", () => {
		for (const name of [
			"get_cart",
			"get_order_status",
			"get_staples",
			"list_orders",
			"view_cart",
			"update_staples",
			"update_cart_item",
		]) {
			expect(intentFromToolCues({ name })).toBe("other");
		}
	});

	test("camelCase and kebab-case names are read like snake_case", () => {
		expect(intentFromToolCues({ name: "addToCart" })).toBe("addToCart");
		expect(intentFromToolCues({ name: "search-products" })).toBe("search");
		expect(intentFromToolCues({ name: "startCheckout" })).toBe("checkout");
	});

	test("a name that says nothing is left to Laya", () => {
		expect(intentFromToolCues({ name: "do_thing" })).toBeUndefined();
		expect(intentFromToolCues({ name: "x" })).toBeUndefined();
	});

	test("the description is never read: «Read the cart … add» must not become addToCart", () => {
		expect(
			intentFromToolCues({
				name: "get_cart",
				description: "Read the cart, then add what is missing",
			}),
		).toBe("other");
	});
});

describe("specialistPenalty", () => {
	test("the plain tool of an intent costs nothing extra; qualifiers in its name do", () => {
		expect(specialistPenalty("add_to_cart", "addToCart")).toBe(0);
		expect(specialistPenalty("add_recipe_to_cart", "addToCart")).toBe(1);
		expect(specialistPenalty("add_staples_to_cart", "addToCart")).toBe(1);
		expect(specialistPenalty("search_products", "search")).toBe(0);
		expect(specialistPenalty("search_recipes_by_ingredient", "search")).toBe(3);
	});

	test("capped, so a long name can't price a tool out of every plan", () => {
		expect(
			specialistPenalty("add_my_very_special_seasonal_bulk_cart", "addToCart"),
		).toBe(3);
	});

	test("an intent without a core vocabulary adds nothing", () => {
		expect(specialistPenalty("whatever_this_is", "other")).toBe(0);
	});
});
