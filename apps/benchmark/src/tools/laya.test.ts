import { describe, expect, test } from "bun:test";
import { buildCases, type Case } from "./cases.ts";
import { deltaCases, layaFields } from "./laya.ts";

const tool = {
	name: "book_flight",
	description: "Book a flight.",
	inputSchema: {
		type: "object" as const,
		properties: {
			cabin: { type: "string", enum: ["economy", "business"] },
			seat: { type: "string", enum: ["aisle", "window"] },
			to: { type: "string" },
		},
		required: ["cabin", "to"],
	},
};

const flight = (expected: Record<string, unknown>): Case => ({
	id: "x",
	tool,
	facts: {},
	request: "",
	expected,
});

describe("layaFields", () => {
	test("required parameters with a fixed list of values — what Laya picks in production", () => {
		expect(layaFields(tool)).toEqual(["cabin"]);
	});
});

describe("deltaCases", () => {
	test("drops a case only when every expected field is Laya's", () => {
		expect(deltaCases([flight({ cabin: "business" })])).toEqual([]);
		const mixed = flight({ cabin: "business", to: "Rome" });
		expect(deltaCases([mixed])).toEqual([mixed]);
	});

	test("a case with nothing expected (no arguments, or judged by content) stays", () => {
		const empty = flight({});
		expect(deltaCases([empty])).toEqual([empty]);
	});

	test("in the demo that is choosing a store", () => {
		const all = buildCases();
		const dropped = all.filter((c) => !deltaCases(all).includes(c));
		expect(dropped.length).toBeGreaterThan(0);
		expect(new Set(dropped.map((c) => c.tool.name))).toEqual(
			new Set(["choose_store"]),
		);
	});
});
