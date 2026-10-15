import { describe, expect, test } from "bun:test";
import { colors } from "@bunli/utils";
import type { ComplexCase, ComplexResult, FieldKind } from "./tools.types.ts";
import {
	highlight,
	renderComplexCase,
	renderComplexTable,
} from "./tools.view.ts";

const plain = (text: string) => colors.strip(text);
const tag = Object.fromEntries(
	(["query", "keywords", "enum", "boolean", "number"] as FieldKind[]).map(
		(kind) => [kind, (text: string) => `[${kind}:${text}]`],
	),
) as Record<FieldKind, (text: string) => string>;

describe("highlight", () => {
	test("paints each field's words by its kind, in the request's own case", () => {
		expect(
			highlight(
				"A Laptop, refurbished is fine, up to 900 euros",
				[
					{ source: "900 euros", kind: "number" },
					{ source: "laptop", kind: "query" },
					{ source: "refurbished is fine", kind: "boolean" },
				],
				tag,
			),
		).toBe(
			"A [query:Laptop], [boolean:refurbished is fine], up to [number:900 euros]",
		);
	});

	test("words that aren't there are skipped", () => {
		expect(highlight("abc", [{ source: "x", kind: "enum" }], tag)).toBe("abc");
	});
});

const laptop: ComplexCase = {
	id: "laptop",
	domain: "electronics",
	tool: {
		name: "search",
		description: "",
		inputSchema: { type: "object", properties: {} },
	},
	request: "a laptop under 900 euros",
	fields: {
		query: {
			kind: "query",
			source: "laptop",
			words: [["laptop"]],
			maxWords: 3,
		},
		max_price: { kind: "number", source: "900 euros", value: 900 },
	},
};

const result: ComplexResult = {
	id: "laptop",
	valid: true,
	latencyMs: 412.3,
	promptTokens: 500,
	outputTokens: 20,
	deltaCalls: 3,
	actual: { query: "laptop", max_price: 1000, sort: "rating" },
	ok: false,
	extra: ["sort"],
	fields: [
		{ name: "query", kind: "query", ok: true, value: "laptop" },
		{
			name: "max_price",
			kind: "number",
			ok: false,
			value: 1000,
			reason: "1000 ≠ 900",
		},
	],
};

describe("renderComplexCase", () => {
	test("request → each field with its verdict, extras and latency", () => {
		const text = plain(renderComplexCase(laptop, result));
		expect(text).toContain("electronics");
		expect(text).toContain("412 ms");
		expect(text).toContain("a laptop under 900 euros");
		expect(text).toMatch(/✅ query\s+query\s+"laptop"/);
		expect(text).toContain("❌ max_price");
		expect(text).toContain("1000 ≠ 900");
		expect(text).toContain("extra: sort");
	});

	test("a failed call shows its error", () => {
		const text = plain(
			renderComplexCase(laptop, {
				...result,
				error: "500 boom",
				valid: false,
				fields: [],
			}),
		);
		expect(text).toContain("500 boom");
	});
});

describe("renderComplexTable", () => {
	test("whole cases, each kind of field, speed", () => {
		const text = plain(
			renderComplexTable("qwen3-1.7b", {
				cases: 6,
				allFields: 0.5,
				valid: 1,
				p50Ms: 812.4,
				p90Ms: 1500,
				meanMs: 900,
				byKind: { query: { right: 3, total: 4 }, enum: { right: 6, total: 6 } },
				meanPromptTokens: 480,
				meanOutputTokens: 40,
				meanDeltaCalls: 3.5,
				meanLayaMs: 61.2,
			}),
		);
		expect(text).toContain("qwen3-1.7b");
		expect(text).toContain("50%");
		expect(text).toContain("75% (3/4)");
		expect(text).toContain("100% (6/6)");
		expect(text).toContain("812");
		expect(text).toMatch(/delta calls\s*\|\s*3\.5/);
		expect(text).toMatch(/Laya ms\s*\|\s*61/);
		// A kind no case asked for.
		expect(text).toContain("—");
		const header = text.split("\n").find((line) => line.startsWith("|"));
		expect(header?.split("|").length).toBeLessThanOrEqual(5 + 2);
	});
});
