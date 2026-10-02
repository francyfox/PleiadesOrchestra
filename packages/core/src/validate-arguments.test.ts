import { describe, expect, test } from "bun:test";
import { validateArguments } from "./validate-arguments.ts";

const schema = {
	type: "object",
	properties: {
		query: { type: "string" },
		max_price: { type: "number" },
		department: { type: "string", enum: ["Dairy", "Bakery"] },
		items: {
			type: "array",
			items: {
				type: "object",
				properties: {
					product: { type: "string" },
					quantity: { type: "integer" },
				},
				required: ["product"],
			},
		},
	},
	required: ["query"],
};

describe("validateArguments", () => {
	test("a conforming object has no problems", () => {
		expect(
			validateArguments(schema, {
				query: "cheese",
				items: [{ product: "Brie", quantity: 2 }],
			}),
		).toEqual([]);
	});

	test("a missing required field is named", () => {
		expect(validateArguments(schema, {})).toEqual(["query is required"]);
	});

	test("wrong types and values outside an enum are reported with their path", () => {
		expect(
			validateArguments(schema, {
				query: 5,
				max_price: "3",
				department: "Frozen",
			}),
		).toEqual([
			"query must be string",
			"max_price must be number",
			"department must be one of Dairy, Bakery",
		]);
	});

	test("array items are checked one by one", () => {
		expect(
			validateArguments(schema, {
				query: "x",
				items: [{ product: "Brie", quantity: 1.5 }, {}],
			}),
		).toEqual([
			"items[0].quantity must be integer",
			"items[1].product is required",
		]);
	});

	test("a schema that says nothing accepts anything; a non-object value is rejected", () => {
		expect(validateArguments({ type: "object" }, { any: 1 })).toEqual([]);
		expect(validateArguments(schema, "text")).toEqual([
			"arguments must be object",
		]);
	});
});
