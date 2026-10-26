import { describe, expect, test } from "bun:test";
import { buildCases } from "./efficiency.cases.ts";
import {
	costUsd,
	judge,
	loadPrices,
	priceOf,
	summarizeContender,
} from "./efficiency.service.ts";
import { createMockShop } from "./efficiency.shop.ts";
import type { CaseRun } from "./efficiency.types.ts";
import { renderReport } from "./efficiency.view.ts";

const run = (over: Partial<CaseRun>): CaseRun => ({
	id: "x",
	ok: true,
	latencyMs: 100,
	modelCalls: 2,
	toolCalls: 1,
	inputTokens: 1000,
	outputTokens: 100,
	costUsd: 0.01,
	reply: "",
	...over,
});

describe("judge", () => {
	const test1 = {
		id: "price",
		text: "",
		start: {},
		expected: {},
		replyIncludes: "12.50",
	};

	test("the cart must match exactly, and the reply say what was asked", () => {
		expect(judge(test1, {}, "It costs $12.50.")).toBe(true);
		expect(judge(test1, {}, "It costs $12.")).toBe(false);
		expect(judge(test1, { Hat: 1 }, "It costs $12.50.")).toBe(false);
		expect(
			judge(
				{ ...test1, expected: { Hat: 2 }, replyIncludes: undefined },
				{ Hat: 1 },
				"",
			),
		).toBe(false);
	});
});

describe("buildCases", () => {
	test("every case is reachable in the seeded shop", () => {
		const shop = createMockShop(42);
		const names = new Set(shop.catalog.map((product) => product.name));
		for (const one of buildCases(shop.catalog)) {
			for (const name of [
				...Object.keys(one.start),
				...Object.keys(one.expected),
			])
				expect(names.has(name)).toBe(true);
		}
	});
});

describe("summarizeContender", () => {
	test("success share, steps per case and the runs' cost added up", () => {
		const summary = summarizeContender({ name: "beta", tokensNote: "" }, [
			run({ latencyMs: 100 }),
			run({ ok: false, latencyMs: 300, toolCalls: 3 }),
		]);
		expect(summary.success).toBe(0.5);
		expect(summary.p50Ms).toBe(100);
		expect(summary.meanSteps).toBe(4);
		expect(summary.costUsd).toBeCloseTo(0.02);
		expect(costUsd(1_000_000, 1_000_000, { input: 1, output: 10 })).toBe(11);
	});
});

describe("prices", () => {
	const list = {
		data: [
			{
				id: "google/gemini-2.5-flash-lite",
				pricing: { prompt: "0.0000001", completion: "0.0000004" },
			},
			{ id: "openrouter/auto", pricing: { prompt: "-1", completion: "-1" } },
		],
	};
	const fallback = { input: 9, output: 9 };

	test("per 1M tokens; a versioned response id finds its model; unknown = fallback", async () => {
		const prices = await loadPrices(async () => Response.json(list));
		const of = priceOf(prices, fallback);
		expect(of("google/gemini-2.5-flash-lite").input).toBeCloseTo(0.1);
		expect(of("google/gemini-2.5-flash-lite-001").output).toBeCloseTo(0.4);
		expect(of("openrouter/auto")).toBe(fallback);
		expect(of("local-model")).toBe(fallback);
		expect(of(undefined)).toBe(fallback);
	});

	test("a failed price list is empty, not a crash", async () => {
		expect(
			(await loadPrices(async () => new Response("", { status: 500 }))).size,
		).toBe(0);
		expect(
			(
				await loadPrices(async () => {
					throw new Error("offline");
				})
			).size,
		).toBe(0);
	});
});

describe("renderReport", () => {
	test("plain text: no colours, no emoji, one column per contender", () => {
		const report = renderReport({
			at: "2026-10-26T00:00:00.000Z",
			seed: 1,
			price: { input: 0.05, output: 0.08 },
			summaries: [
				summarizeContender({ name: "beta alone", tokensNote: "all" }, [
					run({}),
				]),
				summarizeContender({ name: "orchestra", tokensNote: "all" }, [
					run({ ok: false, error: "boom" }),
				]),
			],
		});
		expect(report).toContain("beta alone");
		expect(report).toContain("orchestra");
		expect(report).toContain("boom");
		// biome-ignore lint/suspicious/noControlCharactersInRegex: checking for ANSI escapes
		expect(report).not.toMatch(/\x1b|\p{Extended_Pictographic}/u);
	});
});
