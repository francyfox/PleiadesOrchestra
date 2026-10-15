import { describe, expect, test } from "bun:test";
import type { ToolSpec } from "../delta/delta.types.ts";
import {
	layaArguments,
	layaFields,
	layaQuestions,
	NOT_SAID,
} from "./laya.service.ts";

// A non-shop tool on purpose.
const tool: ToolSpec = {
	name: "book_flight",
	description: "Book a flight.",
	inputSchema: {
		type: "object",
		properties: {
			to: { type: "string", description: "City." },
			cabin: {
				type: "string",
				enum: ["economy", "business"],
				description: "Cabin class.",
			},
			seat: { type: "string", enum: ["aisle", "window"] },
			extra_bag: { type: "boolean", description: "A checked bag." },
			insured: { type: "boolean" },
			passengers: { type: "integer" },
			meals: { type: "array", items: { type: "string", enum: ["veg"] } },
		},
		required: ["to", "cabin", "insured"],
	},
};

describe("layaFields", () => {
	test("text enums and booleans, in schema order; lists and free fields stay with delta", () => {
		expect(layaFields(tool)).toEqual(["cabin", "seat", "extra_bag", "insured"]);
	});
});

describe("layaQuestions", () => {
	const questions = layaQuestions(tool);

	test("an enum is a choice among its values; an optional one may be left unsaid", () => {
		expect(questions.cabin).toEqual({
			type: "choice",
			instructions: "Which cabin does the request ask for? (Cabin class.)",
			criteria: { economy: null, business: null },
		});
		expect(questions.seat?.type).toBe("choice");
		expect(questions.seat).toMatchObject({
			criteria: {
				aisle: null,
				window: null,
				[NOT_SAID]: "the request does not say",
			},
		});
	});

	test("machine-style values get a readable description, plain words stay as they are", () => {
		const sorted = layaQuestions({
			name: "search",
			description: "",
			inputSchema: {
				type: "object",
				properties: {
					sort: {
						type: "string",
						enum: ["price_low", "price-high", "rating", "newestFirst", "XL"],
					},
				},
				required: ["sort"],
			},
		});
		expect(sorted.sort).toMatchObject({
			criteria: {
				price_low: "price low",
				"price-high": "price high",
				rating: null,
				newestFirst: "newest first",
				XL: null,
			},
		});
	});

	test("a boolean is a yes/no on the field's meaning", () => {
		expect(questions.extra_bag).toEqual({
			type: "boolean",
			instructions:
				"Does the request ask for this: extra bag (A checked bag.)?",
		});
		expect(questions.insured).toEqual({
			type: "boolean",
			instructions: "Does the request ask for this: insured?",
		});
	});

	test("nothing for the other fields", () => {
		expect(Object.keys(questions)).toEqual(layaFields(tool));
	});
});

describe("layaArguments", () => {
	const choice = (choice: string) => ({ type: "choice" as const, choice });
	const boolean = (probability: number) => ({
		type: "boolean" as const,
		probability,
	});

	test("picked values are filled; 'not said' and unlikely booleans are left out", () => {
		expect(
			layaArguments(tool, {
				cabin: choice("business"),
				seat: choice(NOT_SAID),
				extra_bag: boolean(0.2),
				insured: boolean(0.9),
			}),
		).toEqual({
			args: { cabin: "business", insured: true },
			skip: ["seat", "extra_bag"],
		});
	});

	test("a required boolean is always given: false when unlikely", () => {
		expect(
			layaArguments(tool, {
				cabin: choice("economy"),
				seat: choice("window"),
				extra_bag: boolean(0.7),
				insured: boolean(0.1),
			}).args,
		).toEqual({
			cabin: "economy",
			seat: "window",
			extra_bag: true,
			insured: false,
		});
	});

	test("no or unusable answer: the field goes back to delta", () => {
		const result = layaArguments(tool, { cabin: choice("first") });
		expect(result.args).toEqual({});
		expect(result.skip).toEqual([]);
	});
});
