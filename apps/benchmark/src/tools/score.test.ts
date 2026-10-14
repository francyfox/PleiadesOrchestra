import { describe, expect, test } from "bun:test";
import { argsMatch, ingredientsMatch, summarize } from "./score.ts";

describe("argsMatch", () => {
	test("equal arguments match", () => {
		expect(argsMatch({ query: "cheese" }, { query: "cheese" }).ok).toBe(true);
	});

	test("strings are compared without case or surrounding spaces", () => {
		expect(argsMatch({ query: " Cheese " }, { query: "cheese" }).ok).toBe(true);
	});

	test("a wrong value is reported with the key", () => {
		const result = argsMatch({ query: "milk" }, { query: "cheese" });
		expect(result.ok).toBe(false);
		expect(result.reason).toContain("query");
	});

	test("an invented extra key fails, a missing key fails", () => {
		expect(argsMatch({ query: "a", max_price: 5 }, { query: "a" }).ok).toBe(
			false,
		);
		expect(argsMatch({}, { query: "a" }).ok).toBe(false);
	});

	test("a value equal to the declared default may be left out or given", () => {
		const defaults = { quantity: 1 };
		const expected = { items: [{ product: "Swiss Cheese" }] };
		expect(
			argsMatch({ items: [{ product: "swiss cheese" }] }, expected, defaults)
				.ok,
		).toBe(true);
		expect(
			argsMatch(
				{ items: [{ product: "Swiss Cheese", quantity: 1 }] },
				expected,
				defaults,
			).ok,
		).toBe(true);
		expect(
			argsMatch(
				{ items: [{ product: "Swiss Cheese", quantity: 2 }] },
				expected,
				defaults,
			).ok,
		).toBe(false);
	});

	test("numbers in strings are not numbers", () => {
		expect(argsMatch({ max_price: "5" }, { max_price: 5 }).ok).toBe(false);
		expect(argsMatch({ max_price: 5 }, { max_price: 5 }).ok).toBe(true);
	});

	test("arrays must match element by element, in order", () => {
		expect(
			argsMatch(
				{ dietary: ["vegan", "organic"] },
				{ dietary: ["vegan", "organic"] },
			).ok,
		).toBe(true);
		expect(
			argsMatch(
				{ dietary: ["organic", "vegan"] },
				{ dietary: ["vegan", "organic"] },
			).ok,
		).toBe(false);
	});

	test("anything that is not an object never matches", () => {
		expect(argsMatch(undefined, {}).ok).toBe(false);
		expect(argsMatch("x", {}).ok).toBe(false);
		expect(argsMatch(null, {}).ok).toBe(false);
	});

	test("an empty object matches an empty expectation", () => {
		expect(argsMatch({}, {}).ok).toBe(true);
	});
});

describe("summarize", () => {
	test("accuracy, valid share and latency percentiles", () => {
		const runs = [
			{ ok: true, valid: true, latencyMs: 100 },
			{ ok: false, valid: true, latencyMs: 200 },
			{ ok: false, valid: false, latencyMs: 300 },
			{ ok: true, valid: true, latencyMs: 400 },
		];
		expect(summarize(runs)).toEqual({
			cases: 4,
			accuracy: 0.5,
			valid: 0.75,
			p50Ms: 200,
			p90Ms: 400,
			meanMs: 250,
		});
	});

	test("no runs, no numbers", () => {
		expect(summarize([])).toEqual({
			cases: 0,
			accuracy: 0,
			valid: 0,
			p50Ms: 0,
			p90Ms: 0,
			meanMs: 0,
		});
	});
});

describe("ingredientsMatch", () => {
	const pizza = {
		mustInclude: [
			["mozzarella"],
			["tomato"],
			["basil"],
			["flour", "dough", "crust"],
		],
		maxItems: 8,
	};
	const names = (...list: string[]) => ({
		ingredients: list.map((name) => ({ name })),
	});

	test("passes when every group is covered by some ingredient", () => {
		const actual = names(
			"Fresh mozzarella",
			"Crushed tomatoes",
			"Basil leaves",
			"Pizza dough",
		);
		expect(ingredientsMatch(actual, pizza).ok).toBe(true);
	});

	test("names the missing group", () => {
		const verdict = ingredientsMatch(
			names("mozzarella", "tomato", "basil"),
			pizza,
		);
		expect(verdict.ok).toBe(false);
		expect(verdict.reason).toContain("flour");
	});

	test("too long a list is rejected: a shopping spree is not the recipe", () => {
		const long = names(
			"mozzarella",
			"tomato",
			"basil",
			"flour",
			...Array(6).fill("salt"),
		);
		expect(ingredientsMatch(long, pizza).ok).toBe(false);
	});

	test("an invented recipe field is rejected unless the case expects it", () => {
		const actual = {
			...names("mozzarella", "tomato", "basil", "flour"),
			recipe: "Simple Tomato Pasta",
		};
		expect(ingredientsMatch(actual, pizza).ok).toBe(false);
	});

	test("fields the case insists on must be equal", () => {
		const actual = {
			...names("mozzarella", "tomato", "basil", "flour"),
			preview: true,
		};
		expect(
			ingredientsMatch(actual, { ...pizza, exact: { preview: true } }).ok,
		).toBe(true);
		expect(
			ingredientsMatch(names("mozzarella", "tomato", "basil", "flour"), {
				...pizza,
				exact: { preview: true },
			}).ok,
		).toBe(false);
	});

	test("not an object, or no ingredients at all, fails", () => {
		expect(ingredientsMatch(undefined, pizza).ok).toBe(false);
		expect(ingredientsMatch({}, pizza).ok).toBe(false);
	});
});
