import { describe, expect, test } from "bun:test";
import { DAY_MS } from "../http/http.service.ts";
import { costUsd, createPriceBook } from "./prices.service.ts";

const listing = {
	data: [
		{
			id: "qwen/qwen3-30b-a3b-instruct-2507",
			pricing: { prompt: "0.00000009", completion: "0.0000003" },
		},
		{ id: "openrouter/auto", pricing: { prompt: "-1", completion: "-1" } },
		{ id: "broken", pricing: {} },
	],
};

function fakeFetch(responses: Array<unknown | Error>) {
	let calls = 0;
	const fetch = async () => {
		const next = responses[Math.min(calls++, responses.length - 1)];
		if (next instanceof Error) throw next;
		return Response.json(next);
	};
	return { fetch, calls: () => calls };
}

describe("price book", () => {
	test("reads per-token prices, skips unpriced entries, caches for a day", async () => {
		let now = 1_000;
		const f = fakeFetch([listing]);
		const book = createPriceBook({ fetch: f.fetch, now: () => now });
		const prices = await book.get();
		expect(prices?.get("qwen/qwen3-30b-a3b-instruct-2507")).toEqual({
			input: 0.00000009,
			output: 0.0000003,
		});
		expect(prices?.has("openrouter/auto")).toBe(false);
		expect(prices?.has("broken")).toBe(false);
		now += DAY_MS - 1;
		await book.get();
		expect(f.calls()).toBe(1);
		now += 2;
		await book.get();
		expect(f.calls()).toBe(2);
	});

	test("a failed fetch gives no prices (or the stale ones), never throws", async () => {
		let now = 0;
		const f = fakeFetch([new Error("down"), listing, new Error("down")]);
		const book = createPriceBook({ fetch: f.fetch, now: () => now });
		expect(await book.get()).toBeNull();
		// Failure is remembered for a few minutes, not a whole day.
		await book.get();
		expect(f.calls()).toBe(1);
		now += 10 * 60 * 1000;
		expect((await book.get())?.size).toBe(1);
		now += DAY_MS + 1;
		expect((await book.get())?.size).toBe(1);
	});

	test("an error status counts as a failure", async () => {
		const book = createPriceBook({
			fetch: async () => new Response("no", { status: 500 }),
			now: () => 0,
		});
		expect(await book.get()).toBeNull();
	});

	test("cost is tokens times the per-token price", () => {
		const price = { input: 0.00000009, output: 0.0000003 };
		expect(costUsd(1_000_000, 500_000, price)).toBeCloseTo(0.09 + 0.15, 10);
		expect(costUsd(1_000_000, 500_000, undefined)).toBe(0);
	});
});
