import { describe, expect, test } from "bun:test";
import { groundArguments } from "./ground-arguments.ts";

const schema = {
	type: "object" as const,
	properties: {
		query: { type: "string" },
		department: { type: "string", enum: ["Dairy & Eggs", "Bakery"] },
		max_price: { type: "number" },
		dietary: {
			type: "array",
			items: { type: "string", enum: ["vegan", "gluten-free"] },
		},
	},
	required: ["query"],
};
const ground = (args: Record<string, unknown>, request: string) =>
	groundArguments(schema, args, request);

describe("groundArguments", () => {
	test("an enum value the request never mentions is dropped, one it names is kept", () => {
		expect(
			ground({ query: "cheese", department: "Dairy & Eggs" }, "buy 1 cheese"),
		).toEqual({ query: "cheese" });
		expect(
			ground(
				{ query: "milk", department: "Dairy & Eggs" },
				"milk from the dairy section",
			),
		).toEqual({
			query: "milk",
			department: "Dairy & Eggs",
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
	});

	test("enum-list entries need their word in the request; an emptied list disappears", () => {
		expect(ground({ query: "chips", dietary: ["vegan"] }, "chips")).toEqual({
			query: "chips",
		});
		expect(
			ground({ query: "chips", dietary: ["vegan"] }, "vegan chips"),
		).toEqual({
			query: "chips",
			dietary: ["vegan"],
		});
	});

	test("required fields are never touched", () => {
		expect(ground({ query: "x" }, "unrelated")).toEqual({ query: "x" });
	});
});
