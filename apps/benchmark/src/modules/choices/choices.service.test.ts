import { describe, expect, test } from "bun:test";
import type { ToolSpec } from "../delta/delta.types.ts";
import { judgeChoices, summarizeLaya } from "./choices.service.ts";
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
