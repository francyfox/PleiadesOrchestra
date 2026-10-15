import { describe, expect, test } from "bun:test";
import type { LoadedLaya } from "../laya/laya.types.ts";
import { COMPLEX_CASES } from "./tools.cases.ts";
import {
	judgeCase,
	judgeField,
	runComplex,
	summarizeComplex,
} from "./tools.service.ts";
import type { ComplexCase, ComplexResult } from "./tools.types.ts";

const request = "a laptop for editing 4K video on trains, under 900 euros";

describe("judgeField", () => {
	test("query: every word group, in few words", () => {
		const check = {
			kind: "query" as const,
			source: "laptop",
			words: [["laptop", "notebook"]],
			maxWords: 3,
		};
		expect(judgeField(check, "Laptop", request).ok).toBe(true);
		expect(judgeField(check, "video editing notebook", request).ok).toBe(true);
		expect(judgeField(check, "tablet", request).reason).toContain("laptop");
		// The whole request pasted in is not a query.
		expect(judgeField(check, request, request).reason).toContain("words");
		expect(judgeField(check, 7, request).ok).toBe(false);
	});

	test("keywords: chosen by meaning, not cut out of the request", () => {
		const check = {
			kind: "keywords" as const,
			source: "editing 4K video",
			mustInclude: [
				["gpu", "graphics"],
				["ram", "memory"],
			],
			maxItems: 6,
		};
		expect(judgeField(check, ["dedicated GPU", "32GB RAM"], request).ok).toBe(
			true,
		);
		expect(judgeField(check, ["graphics card"], request).reason).toContain(
			"ram",
		);
		expect(
			judgeField(check, ["gpu", "ram", "a", "b", "c", "d", "e"], request)
				.reason,
		).toContain("7");
		expect(judgeField(check, "gpu, ram", request).ok).toBe(false);
	});

	test("keywords that only repeat the request's words fail even when a group matches", () => {
		const check = {
			kind: "keywords" as const,
			source: "for a margherita pizza",
			mustInclude: [["pizza"]],
			maxItems: 6,
		};
		const verdict = judgeField(
			check,
			["margherita", "pizza"],
			"ingredients for a margherita pizza",
		);
		expect(verdict.ok).toBe(false);
		expect(verdict.reason).toContain("request");
	});

	test("enum, boolean and number are exact; strings ignore case", () => {
		expect(
			judgeField(
				{ kind: "enum", source: "s", value: "price_low" },
				"PRICE_LOW",
				request,
			).ok,
		).toBe(true);
		expect(
			judgeField({ kind: "boolean", source: "s", value: true }, "true", request)
				.ok,
		).toBe(false);
		expect(
			judgeField({ kind: "number", source: "900", value: 900 }, 900, request)
				.ok,
		).toBe(true);
		expect(
			judgeField({ kind: "number", source: "900", value: 900 }, "900", request)
				.ok,
		).toBe(false);
	});

	test("a missing field fails with its expectation", () => {
		expect(
			judgeField(
				{ kind: "boolean", source: "s", value: true },
				undefined,
				request,
			).reason,
		).toBe("missing, want true");
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
	request,
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

describe("judgeCase", () => {
	test("all fields right and nothing extra", () => {
		const judged = judgeCase(laptop, { query: "laptop", max_price: 900 });
		expect(judged.ok).toBe(true);
		expect(judged.fields.map((f) => [f.name, f.ok])).toEqual([
			["query", true],
			["max_price", true],
		]);
	});

	test("an extra field spoils the case but no field's own score", () => {
		const judged = judgeCase(laptop, {
			query: "laptop",
			max_price: 900,
			sort: "rating",
		});
		expect(judged.ok).toBe(false);
		expect(judged.extra).toEqual(["sort"]);
		expect(judged.fields.every((f) => f.ok)).toBe(true);
	});

	test("a free field may be filled or left out", () => {
		const judged = judgeCase(
			{ ...laptop, free: ["sort"] },
			{ query: "laptop", max_price: 900, sort: "rating" },
		);
		expect(judged.ok).toBe(true);
		expect(judged.extra).toEqual([]);
	});

	test("not an object: every field fails", () => {
		const judged = judgeCase(laptop, undefined);
		expect(judged.ok).toBe(false);
		expect(judged.fields.every((f) => !f.ok)).toBe(true);
	});
});

describe("summarizeComplex", () => {
	test("per kind of field, whole cases, speed", () => {
		const result = (
			ok: boolean[],
			latencyMs: number,
			valid = true,
		): ComplexResult => ({
			id: "x",
			valid,
			latencyMs,
			promptTokens: 500,
			outputTokens: 20,
			deltaCalls: 3,
			layaMs: latencyMs / 10,
			actual: {},
			extra: [],
			ok: ok.every(Boolean),
			fields: [
				{ name: "q", kind: "query", ok: ok[0] ?? false, value: "" },
				{ name: "n", kind: "number", ok: ok[1] ?? false, value: 1 },
			],
		});
		const summary = summarizeComplex([
			result([true, true], 100),
			result([true, false], 300),
		]);
		expect(summary.cases).toBe(2);
		expect(summary.allFields).toBe(0.5);
		expect(summary.byKind.query).toEqual({ right: 2, total: 2 });
		expect(summary.byKind.number).toEqual({ right: 1, total: 2 });
		expect(summary.byKind.enum).toBeUndefined();
		expect(summary.p50Ms).toBe(100);
		expect(summary.p90Ms).toBe(300);
		expect(summary.meanOutputTokens).toBe(20);
		expect(summary.meanDeltaCalls).toBe(3);
		expect(summary.meanLayaMs).toBe(20);
	});
});

describe("COMPLEX_CASES", () => {
	test("more than one domain, every kind of field covered", () => {
		expect(new Set(COMPLEX_CASES.map((c) => c.domain)).size).toBeGreaterThan(3);
		const kinds = new Set(
			COMPLEX_CASES.flatMap((c) => Object.values(c.fields).map((f) => f.kind)),
		);
		expect([...kinds].sort()).toEqual([
			"boolean",
			"enum",
			"keywords",
			"number",
			"query",
		]);
	});

	for (const c of COMPLEX_CASES) {
		test(`${c.id}: fixture is consistent with its request and schema`, () => {
			const lower = c.request.toLowerCase();
			const properties = c.tool.inputSchema.properties ?? {};
			for (const name of c.free ?? []) expect(properties[name]).toBeDefined();
			// Highlights don't overlap: each word belongs to one field.
			const spans = Object.values(c.fields)
				.map((f) => {
					const at = lower.indexOf(f.source.toLowerCase());
					return [at, at + f.source.length] as const;
				})
				.sort((a, b) => a[0] - b[0]);
			for (let i = 1; i < spans.length; i++)
				expect(spans[i]?.[0]).toBeGreaterThanOrEqual(spans[i - 1]?.[1] ?? 0);
			for (const [name, check] of Object.entries(c.fields)) {
				// Highlights point at real words of the request.
				expect(lower).toContain(check.source.toLowerCase());
				const property = properties[name] as
					| { type?: string; enum?: unknown[] }
					| undefined;
				expect(property).toBeDefined();
				if (check.kind === "enum")
					expect(property?.enum).toContain(check.value);
				// Keywords must be chosen by meaning: none of them is in the request.
				if (check.kind === "keywords")
					for (const group of check.mustInclude)
						for (const word of group)
							expect(lower).not.toContain(word.toLowerCase());
			}
		});
	}
});

describe("runComplex", () => {
	const cases = COMPLEX_CASES.slice(0, 2);

	test("without Laya every field is delta's; a failed call is a result, not a crash", async () => {
		const asked: string[] = [];
		const results = await runComplex(
			{
				warmUp: async () => {},
				async fillByField(testCase) {
					asked.push(testCase.request);
					if (asked.length === 2) throw new Error("500 boom");
					return {
						args: {},
						latencyMs: 10,
						promptTokens: 5,
						outputTokens: 2,
						calls: 1,
					};
				},
			},
			cases,
		);
		expect(results.map((r) => r.id)).toEqual(cases.map((c) => c.id));
		expect(results[0]).toMatchObject({
			valid: true,
			latencyMs: 10,
			deltaCalls: 1,
		});
		expect(results[1]).toMatchObject({ valid: false, error: "500 boom" });
	});

	test("with Laya: its enums and booleans are prefilled and counted in the time", async () => {
		const [first] = cases;
		const prefilled: unknown[] = [];
		const laya: LoadedLaya = {
			loadMs: 0,
			decide: async () => ({}),
			ask: async () => ({ answers: {}, latencyMs: 7 }),
			close: async () => {},
		};
		const results = await runComplex(
			{
				warmUp: async () => {},
				async fillByField(_testCase, options) {
					prefilled.push(options);
					return {
						args: {},
						latencyMs: 10,
						promptTokens: 0,
						outputTokens: 0,
						calls: 0,
					};
				},
			},
			first ? [first] : [],
			{ laya },
		);
		expect(results[0]).toMatchObject({ latencyMs: 17, layaMs: 7 });
		expect(prefilled).toEqual([{ prefilled: {}, skip: [] }]);
	});
});
