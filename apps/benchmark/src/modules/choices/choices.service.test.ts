import { describe, expect, test } from "bun:test";
import type { ToolSpec } from "../delta/delta.types.ts";
import {
	calibrationRecords,
	judgeChoices,
	summarizeLaya,
} from "./choices.service.ts";
import type { LayaResult } from "./choices.types.ts";

const tool: ToolSpec = {
	name: "search_clothes",
	description: "",
	inputSchema: {
		type: "object",
		properties: {
			size: { type: "string", enum: ["L", "XL"] },
			fit: { type: "string", enum: ["slim", "relaxed"] },
			gift: { type: "boolean" },
			express: { type: "boolean" },
		},
	},
};

describe("judgeChoices", () => {
	const expected = {
		size: "XL",
		fit: null,
		gift: false,
		express: true,
	};

	test("given values must match; unsaid fields must stay out; a refused flag may be out or false", () => {
		const judged = judgeChoices(tool, expected, { size: "xl", express: true });
		expect(judged.map((f) => [f.name, f.kind, f.category, f.ok])).toEqual([
			["size", "enum", "given", true],
			// The kind is the schema's, also when nothing is expected.
			["fit", "enum", "unsaid", true],
			["gift", "boolean", "refused", true],
			["express", "boolean", "given", true],
		]);
		expect(
			judgeChoices(tool, expected, {
				size: "XL",
				gift: false,
				express: true,
			}).every((f) => f.ok),
		).toBe(true);
	});

	test("each miss is named: wrong value, invented, left out", () => {
		const judged = judgeChoices(tool, expected, {
			size: "L",
			fit: "slim",
			gift: true,
		});
		expect(judged.map((f) => f.miss)).toEqual([
			"wrong",
			"invented",
			"invented",
			"left out",
		]);
	});
});

const result = (
	fields: [
		category: "given" | "unsaid" | "refused",
		ok: boolean,
		kind: "enum" | "boolean",
	][],
	latencyMs: number,
): LayaResult => ({
	id: "x",
	latencyMs,
	answers: {},
	actual: {},
	fields: fields.map(([category, ok, kind], i) => ({
		name: `f${i}`,
		kind,
		category,
		ok,
		expected: null,
		actual: undefined,
	})),
});

describe("summarizeLaya", () => {
	test("every decision, by kind and by category, whole requests, speed", () => {
		const summary = summarizeLaya([
			result(
				[
					["given", true, "enum"],
					["unsaid", false, "boolean"],
				],
				30,
			),
			result(
				[
					["given", true, "boolean"],
					["refused", true, "boolean"],
				],
				50,
			),
		]);
		expect(summary.requests).toBe(2);
		expect(summary.decisions).toEqual({ right: 3, total: 4 });
		expect(summary.allRight).toBe(0.5);
		expect(summary.byKind).toEqual({
			enum: { right: 1, total: 1 },
			boolean: { right: 2, total: 3 },
		});
		expect(summary.byCategory).toEqual({
			given: { right: 2, total: 2 },
			unsaid: { right: 0, total: 1 },
			refused: { right: 1, total: 1 },
		});
		expect(summary.p50Ms).toBe(30);
		expect(summary.p90Ms).toBe(50);
	});
});

describe("calibrationRecords", () => {
	const clothes: ToolSpec = {
		...tool,
		inputSchema: { ...tool.inputSchema, required: ["size"] },
	};
	const result = (answers: LayaResult["answers"]): LayaResult => ({
		id: "x",
		latencyMs: 1,
		answers,
		actual: {},
		fields: [],
	});

	test("labels an enum with the expected value, an unsaid optional one with (not said)", () => {
		const records = calibrationRecords(
			[
				{
					id: "x",
					domain: "clothes",
					tool: clothes,
					request: "XL please",
					expected: { size: "XL", fit: null, gift: true, express: false },
				},
			],
			[
				result({
					size: {
						type: "choice",
						choice: "XL",
						probabilities: { L: 0.2, XL: 0.8 },
					},
					fit: {
						type: "choice",
						choice: "slim",
						probabilities: { slim: 0.3, relaxed: 0.2, "(not said)": 0.5 },
					},
					gift: { type: "boolean", probability: 0.9 },
					express: { type: "boolean", probability: 0.1 },
				}),
			],
		);
		expect(records.map((r) => [r.kind, r.label])).toEqual([
			["choice", "XL"],
			["choice", "(not said)"],
			["boolean", true],
			["boolean", false],
		]);
		expect(records[0]?.options).toEqual(["L", "XL"]);
		expect(records[0]?.text).toBe("XL please");
	});

	test("a request that failed has no records", () => {
		expect(
			calibrationRecords(
				[
					{
						id: "x",
						domain: "d",
						tool: clothes,
						request: "r",
						expected: { size: "XL" },
					},
				],
				[{ ...result({}), error: "down" }],
			),
		).toEqual([]);
	});
});
