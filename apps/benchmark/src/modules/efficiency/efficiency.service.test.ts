import { describe, expect, test } from "bun:test";
import { buildCases } from "./efficiency.cases.ts";
import {
	costUsd,
	judge,
	loadPrices,
	priceOf,
	runContender,
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
		lang: "en" as const,
		start: {},
		expected: {},
		lookedUp: "Hat",
	};

	test("only what happened in the shop counts: the cart, and the product the site was asked about", () => {
		expect(judge(test1, { cart: {}, shown: ["Hat"] })).toBe(true);
		expect(judge(test1, { cart: {}, shown: ["Cap"] })).toBe(false);
		expect(judge(test1, { cart: { Hat: 1 }, shown: ["Hat"] })).toBe(false);
		expect(
			judge(
				{ ...test1, expected: { Hat: 2 }, lookedUp: undefined },
				{ cart: { Hat: 1 }, shown: [] },
			),
		).toBe(false);
	});
});

describe("buildCases", () => {
	test("every English case has a Russian twin with the same carts", () => {
		const cases = buildCases(createMockShop(42).catalog);
		const en = cases.filter((one) => one.lang === "en");
		const ru = cases.filter((one) => one.lang === "ru");
		expect(ru.map((one) => one.id)).toEqual(en.map((one) => `${one.id}-ru`));
		expect(ru.map(({ start, expected }) => ({ start, expected }))).toEqual(
			en.map(({ start, expected }) => ({ start, expected })),
		);
		expect(ru.every((one) => /[а-я]/i.test(one.text))).toBe(true);
	});

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
		const summary = summarizeContender(
			{ name: "beta", tokensNote: "" },
			[
				run({ latencyMs: 100 }),
				run({ ok: false, latencyMs: 300, toolCalls: 3 }),
			],
			2,
		);
		expect(summary.success).toBe(0.5);
		expect(summary.p50Ms).toBe(100);
		expect(summary.meanSteps).toBe(4);
		expect(summary.costUsd).toBeCloseTo(0.02);
		expect(summary.iterations).toBe(2);
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
			setup: ["beta-text: m, temperature 0 (was 0.3)"],
			summaries: [
				summarizeContender(
					{ name: "beta alone", tokensNote: "all" },
					[run({})],
					1,
				),
				summarizeContender(
					{ name: "orchestra", tokensNote: "all" },
					[run({ ok: false, error: "boom" })],
					1,
				),
			],
		});
		expect(report).toContain("beta alone");
		expect(report).toContain("orchestra");
		expect(report).toContain("boom");
		// biome-ignore lint/suspicious/noControlCharactersInRegex: checking for ANSI escapes
		expect(report).not.toMatch(/\x1b|\p{Extended_Pictographic}/u);
	});
});

describe("renderReport over iterations", () => {
	const report = renderReport({
		at: "2026-10-26T00:00:00.000Z",
		seed: 1,
		price: { input: 0.05, output: 0.08 },
		setup: ["beta-text: m, temperature 0 (was 0.3)"],
		summaries: [
			summarizeContender(
				{ name: "orchestra", tokensNote: "all" },
				[
					run({ id: "a", latencyMs: 1000, reply: "fine" }),
					run({ id: "a", ok: false, latencyMs: 3000, error: "boom" }),
					run({ id: "a", latencyMs: 2000, reply: "late" }),
					run({ id: "b", reply: "only" }),
					run({ id: "b", reply: "last ok" }),
					run({ id: "b", reply: "newest" }),
				].map((one, i) => ({ ...one, costUsd: i < 3 ? 0.01 : 0.03 })),
				3,
			),
		],
	});

	test("header, setup and averages: tokens and cost per iteration, cost per success", () => {
		expect(report).toContain("3 iterations");
		expect(report).toContain("beta-text: m, temperature 0 (was 0.3)");
		// 6 runs x 1100 tokens over 3 iterations = 2200 in+out; here input alone is 2000.
		expect(report).toMatch(/input tokens \/ iteration\s+2000/);
		expect(report).toMatch(/cost \/ iteration\s+\$0\.040000/);
		// total 0.12 over 5 successes
		expect(report).toMatch(/cost \/ success\s+\$0\.024000/);
		expect(report).toMatch(/success\s+83%/);
	});

	test("one row per case: ok as k/N, mean time, the last failure's error else the last reply", () => {
		expect(report).toMatch(/\ba\s+2\/3\s+0\s+2\.00 s.*boom/);
		expect(report).toMatch(/\bb\s+3\/3.*newest/);
	});
});

describe("summarizeContender with infrastructure errors", () => {
	test("errors stay out of success and means, and a partial run averages over what is done", () => {
		const summary = summarizeContender(
			{ name: "x", tokensNote: "" },
			[
				run({ id: "a", latencyMs: 100 }),
				run({
					id: "b",
					ok: false,
					status: "error",
					errorCategory: "http",
					latencyMs: 9000,
				}),
				run({ id: "a", ok: false, latencyMs: 300 }),
			],
			6,
		);
		expect(summary).toMatchObject({ errors: 1, cases: 3, iterations: 6 });
		expect(summary.success).toBe(0.5);
		expect(summary.meanMs).toBe(200);
		expect(summary.done).toBeCloseTo(1.5);
	});
});

describe("runContender", () => {
	const cases = ["a", "b", "c"].map((id) => ({
		id,
		text: "",
		lang: "en" as const,
		start: {},
		expected: {},
	}));
	const newShop = () => createMockShop(1);

	test("at most `concurrency` run at once, and the runs come back in plan order", async () => {
		let active = 0;
		let peak = 0;
		const contender = {
			name: "fake",
			tokensNote: "",
			async run(_shop: unknown, test: { id: string }) {
				active++;
				peak = Math.max(peak, active);
				// later cases finish first
				await Bun.sleep(test.id === "a" ? 30 : test.id === "b" ? 15 : 1);
				active--;
				return { ...run({ id: test.id }), ok: undefined as never };
			},
		};
		const finished: string[] = [];
		const result = await runContender({
			contender,
			cases,
			iterations: 2,
			concurrency: 2,
			newShop,
			onResult: ({ run: one }) => finished.push(one.id),
		});
		expect(peak).toBe(2);
		expect(result.runs.map((one) => one.id)).toEqual([
			"a",
			"b",
			"c",
			"a",
			"b",
			"c",
		]);
		expect(finished).not.toEqual(result.runs.map((one) => one.id));
		expect(result.runs.every((one) => one.ok)).toBe(true);
	});

	test("consecutive infrastructure errors stop the run; an error is not a failed case", async () => {
		let calls = 0;
		const contender = {
			name: "fake",
			tokensNote: "",
			async run(_shop: unknown, test: { id: string }) {
				calls++;
				return {
					...run({ id: test.id }),
					ok: undefined as never,
					status: "error" as const,
					errorCategory: "http" as const,
					error: "HTTP 503",
				};
			},
		};
		const result = await runContender({
			contender,
			cases,
			iterations: 3,
			concurrency: 1,
			newShop,
			stopAfterErrors: 5,
		});
		expect(result.stopped).toBe(true);
		expect(calls).toBe(5);
		const summary = summarizeContender(contender, result.runs, 3);
		expect(summary).toMatchObject({ errors: 5, success: 0 });
	});
});

describe("renderReport of a partial run with infrastructure errors", () => {
	const report = renderReport({
		at: "2026-10-26T00:00:00.000Z",
		seed: 1,
		price: { input: 0.05, output: 0.08 },
		setup: [],
		summaries: [
			summarizeContender(
				{ name: "orchestra", tokensNote: "all" },
				[
					run({ id: "a" }),
					run({ id: "b" }),
					run({ id: "a" }),
					run({
						id: "b",
						ok: false,
						status: "error",
						errorCategory: "timeout",
						error: "timed out",
					}),
				],
				6,
			),
			summarizeContender({ name: "other", tokensNote: "" }, [], 6),
		],
	});

	test("says how far each contender got, marks the report partial, counts errors apart", () => {
		expect(report).toContain("PARTIAL REPORT");
		expect(report).toContain("orchestra: 2/6 iterations");
		expect(report).toContain("other: 0/6 iterations");
		expect(report).toMatch(/errors\s+1\s+-/);
		expect(report).toMatch(/success\s+100%/);
		expect(report).toMatch(/\bb\s+1\/1\s+1\s.*timed out/);
	});
});
