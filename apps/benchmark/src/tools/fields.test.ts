import { describe, expect, test } from "bun:test";
import { describeFields } from "./fields.ts";

// A non-shop tool on purpose: the block must read any site's schema.
const BOOK_ROOM = {
	type: "object" as const,
	properties: {
		city: { type: "string", description: "City to stay in." },
		room: {
			type: "string",
			enum: ["single", "double", "suite"],
			description: "Room kind.",
		},
		nights: { type: "integer", minimum: 1, maximum: 30 },
		guests: {
			type: "array",
			description: "Everyone staying.",
			items: {
				type: "object",
				properties: {
					name: { type: "string", description: "Full name." },
					age: { type: "integer", minimum: 0 },
				},
				required: ["name"],
			},
		},
		extras: {
			type: "array",
			items: { type: "string", enum: ["breakfast", "parking"] },
		},
	},
	required: ["city", "nights"],
};

describe("describeFields", () => {
	test("one line per field: type, required, every enum value, range, description; nested fields indented", () => {
		expect(describeFields(BOOK_ROOM)).toBe(
			[
				"Fields:",
				"- city (string, required): City to stay in.",
				'- room (string, one of: "single", "double", "suite"): Room kind.',
				"- nights (integer 1-30, required)",
				"- guests (list of objects): Everyone staying.",
				"  - name (string, required): Full name.",
				"  - age (integer >= 0)",
				'- extras (list of: "breakfast", "parking")',
			].join("\n"),
		);
	});

	test("a long enum is listed whole, not cut", () => {
		const values = Array.from({ length: 40 }, (_, i) => `v${i}`);
		const text = describeFields({
			type: "object",
			properties: { pick: { type: "string", enum: values } },
		});
		for (const value of values) expect(text).toContain(`"${value}"`);
	});

	test("no properties: nothing to describe", () => {
		expect(describeFields({ type: "object" })).toBe("");
	});
});
