import { describe, expect, test } from "bun:test";
import { groundArguments } from "./sanitize.ts";
import { TOOLS } from "./tools.ts";

const search = TOOLS.search_products as (typeof TOOLS)[string];
const ground = (args: Record<string, unknown>, request: string) =>
	groundArguments(search, args, request);

describe("groundArguments: optional fields need words in the request", () => {
	test("a department the request never mentions is dropped", () => {
		expect(
			ground({ query: "cheese", department: "Dairy & Eggs" }, "buy 1 cheese"),
		).toEqual({
			query: "cheese",
		});
	});

	test("a department the request names is kept", () => {
		expect(
			ground(
				{ query: "milk", department: "Dairy & Eggs" },
				"milk from the dairy section",
			),
		).toEqual({ query: "milk", department: "Dairy & Eggs" });
		expect(
			ground({ department: "Bakery" }, "show me the bakery aisle"),
		).toEqual({
			department: "Bakery",
		});
	});

	test("a number the request doesn't contain is dropped, one it does is kept", () => {
		expect(ground({ query: "apple", max_price: 10 }, "buy 1 apple")).toEqual({
			query: "apple",
		});
		expect(
			ground({ query: "oat milk", max_price: 5 }, "oat milk under 5 dollars"),
		).toEqual({
			query: "oat milk",
			max_price: 5,
		});
		expect(
			ground({ query: "milk", max_price: 4.5 }, "milk under $4.50"),
		).toEqual({
			query: "milk",
			max_price: 4.5,
		});
	});

	test("a dietary tag needs its word in the request; empty lists go", () => {
		expect(
			ground({ query: "chips", dietary: ["organic"] }, "vegan chips"),
		).toEqual({
			query: "chips",
		});
		expect(ground({ query: "bread", dietary: [] }, "some bread")).toEqual({
			query: "bread",
		});
		expect(
			ground(
				{ query: "bread", dietary: ["gluten-free", "dairy-free"] },
				"gluten-free and dairy-free bread",
			),
		).toEqual({ query: "bread", dietary: ["gluten-free", "dairy-free"] });
	});

	test("a diet word stuck in the query moves to the dietary filter", () => {
		expect(ground({ query: "vegan chips" }, "vegan chips")).toEqual({
			query: "chips",
			dietary: ["vegan"],
		});
		expect(ground({ query: "organic bananas" }, "organic bananas")).toEqual({
			query: "bananas",
			dietary: ["organic"],
		});
	});

	test("required fields are never touched", () => {
		const store = TOOLS.choose_store as (typeof TOOLS)[string];
		expect(
			groundArguments(store, { store: "Penny Pantry" }, "go somewhere"),
		).toEqual({
			store: "Penny Pantry",
		});
	});

	test("a query that is only a diet word stays as it is", () => {
		expect(ground({ query: "vegan" }, "vegan")).toEqual({
			query: "vegan",
			dietary: ["vegan"],
		});
	});
});
