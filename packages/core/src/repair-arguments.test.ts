import { describe, expect, test } from "bun:test";
import { repairArguments } from "./repair-arguments.ts";

const schema = {
	type: "object",
	properties: {
		query: { type: "string" },
		quantity: { type: "integer" },
		max_price: { type: "number" },
		in_stock: { type: "boolean" },
		department: { type: "string", enum: ["Dairy", "Bakery"] },
		dietary: { type: "array", items: { type: "string" } },
	},
	required: ["query"],
};
const repair = (text: string) => repairArguments(text, schema);

describe("repairArguments: fixes what is mechanical", () => {
	test("clean JSON passes through", () => {
		expect(repair('{"query":"cheese"}')).toEqual({ query: "cheese" });
	});

	test("code fences, <think> blocks and chatter around the object are cut away", () => {
		expect(repair('```json\n{"query":"cheese"}\n```')).toEqual({
			query: "cheese",
		});
		expect(repair('<think>hmm</think>{"query":"cheese"}')).toEqual({
			query: "cheese",
		});
		expect(repair('Here you go: {"query":"cheese"} Hope it helps')).toEqual({
			query: "cheese",
		});
	});

	test("trailing commas are removed", () => {
		expect(repair('{"query":"cheese",}')).toEqual({ query: "cheese" });
	});

	test("a cut-off object is closed after its last complete value", () => {
		expect(repair('{"query":"cheese","dietary":["vegan"')).toEqual({
			query: "cheese",
			dietary: ["vegan"],
		});
		// …but never a string cut off mid-way: "chee" is not what the model meant.
		expect(repair('{"query":"chee')).toBeUndefined();
	});

	test("values are coerced to the schema's types", () => {
		expect(
			repair(
				'{"query":"x","quantity":"3","max_price":"4.5","in_stock":"true"}',
			),
		).toEqual({ query: "x", quantity: 3, max_price: 4.5, in_stock: true });
		expect(repair('{"query":"x","dietary":"vegan"}')).toEqual({
			query: "x",
			dietary: ["vegan"],
		});
		expect(repair('{"query":"x","quantity":2.0}')).toEqual({
			query: "x",
			quantity: 2,
		});
	});

	test("an enum value in the wrong case gets its canonical spelling", () => {
		expect(repair('{"query":"x","department":"dairy"}')).toEqual({
			query: "x",
			department: "Dairy",
		});
	});

	test("null for an optional field means 'not given'", () => {
		expect(repair('{"query":"x","department":null}')).toEqual({ query: "x" });
	});

	test("nothing to repair: undefined, so the caller can ask the model again", () => {
		expect(repair("sorry, I can't")).toBeUndefined();
		expect(repair("[1,2]")).toBeUndefined();
		expect(repair("")).toBeUndefined();
	});
});
