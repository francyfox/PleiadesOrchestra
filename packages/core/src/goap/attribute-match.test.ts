import { expect, test } from "bun:test";
import { matchingAttributes } from "./attribute-match.ts";

const size = { name: "size", values: ["Small", "Large"] };

test("attribute name overlaps the parameter name", () => {
	const a = { name: "sizes", value: "maximum" };
	expect(
		matchingAttributes([a, { name: "diet", value: "vegan" }], size),
	).toEqual([a]);
});

test("attribute value overlaps an enum value or the description", () => {
	const large = { name: "portion", value: "large" };
	expect(matchingAttributes([large], size)).toEqual([large]);
	const sort = { name: "ordering", value: "cheapest" };
	expect(
		matchingAttributes([sort], {
			name: "sort",
			description: "Show the cheapest first",
			values: ["price_asc", "price_desc"],
		}),
	).toEqual([sort]);
});

test("camelCase and snake_case parameter names", () => {
	const guests = { name: "guests", value: "4" };
	expect(
		matchingAttributes([guests], {
			name: "numberOfGuests",
			values: ["1", "2"],
		}),
	).toEqual([guests]);
	expect(
		matchingAttributes([guests], { name: "number_of_guests", values: ["1"] }),
	).toEqual([guests]);
});

test("no overlap, and function words alone, do not match", () => {
	expect(
		matchingAttributes([{ name: "color", value: "the red" }], {
			name: "sort",
			description: "the order of the list",
			values: ["asc"],
		}),
	).toEqual([]);
});
