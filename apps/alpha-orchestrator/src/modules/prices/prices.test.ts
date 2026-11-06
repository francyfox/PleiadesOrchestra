import { describe, expect, test } from "bun:test";
import { testDb } from "../database/database.testing.ts";
import { DAY_MS } from "../http/http.service.ts";
import { admin, json, setupAdminApp } from "../http/http.testing.ts";
import {
	costUsd,
	createPriceBook,
	readLocalPrices,
	saveLocalPrice,
} from "./prices.service.ts";

const listing = {
	data: [
		{
			id: "qwen/qwen3-30b-a3b-instruct-2507",
			pricing: { prompt: "0.00000009", completion: "0.0000003" },
		},
		{
			id: "cached/model",
			pricing: {
				prompt: "0.000001",
				completion: "0.000002",
				input_cache_read: "0.0000001",
			},
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

	test("reads input_cache_read when OpenRouter lists it, leaves it out otherwise", async () => {
		const prices = await createPriceBook({
			fetch: fakeFetch([listing]).fetch,
		}).get();
		expect(prices?.get("cached/model")?.cacheRead).toBe(0.0000001);
		expect(prices?.get("qwen/qwen3-30b-a3b-instruct-2507")?.cacheRead).toBe(
			undefined,
		);
	});

	test("an explicit local price wins over OpenRouter's and adds unlisted models", async () => {
		const db = testDb();
		saveLocalPrice(db, "cached/model", {
			inputPerMillionUsd: 5,
			outputPerMillionUsd: 6,
		});
		saveLocalPrice(db, "my-local.gguf", {
			inputPerMillionUsd: 1,
			outputPerMillionUsd: 2,
			cacheReadPerMillionUsd: 0.5,
		});
		const book = createPriceBook({
			fetch: fakeFetch([listing]).fetch,
			local: () => readLocalPrices(db),
		});
		const prices = await book.get();
		expect(prices?.get("cached/model")).toEqual({
			input: 0.000005,
			output: 0.000006,
		});
		expect(prices?.get("my-local.gguf")).toEqual({
			input: 0.000001,
			output: 0.000002,
			cacheRead: 0.0000005,
		});
		expect(book.peek()?.get("my-local.gguf")?.input).toBe(0.000001);
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
		expect((await book.get())?.size).toBe(2);
		now += DAY_MS + 1;
		expect((await book.get())?.size).toBe(2);
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

	test("cached tokens are part of the input and use the cache price, else the input price", () => {
		const price = { input: 0.000001, output: 0.000002, cacheRead: 0.0000001 };
		expect(costUsd(1000, 500, price, 800)).toBeCloseTo(0.00128, 10);
		expect(costUsd(1000, 0, { input: 0.000001, output: 0 }, 800)).toBeCloseTo(
			0.001,
			10,
		);
		// More cached than input (bad data) never goes negative.
		expect(costUsd(100, 0, price, 500)).toBeCloseTo(0.00001, 10);
	});
});

describe("local price routes", () => {
	test("add, change, list and remove a model's price; a model id with a slash works", async () => {
		const { app } = setupAdminApp();
		const put = (model: string, body: unknown) =>
			app.handle(
				admin(`/local-prices/${encodeURIComponent(model)}`, {
					method: "PUT",
					body,
				}),
			);
		expect(
			(await put("org/m", { inputPerMillionUsd: 1, outputPerMillionUsd: 2 }))
				.status,
		).toBe(200);
		await put("org/m", {
			inputPerMillionUsd: 3,
			outputPerMillionUsd: 4,
			cacheReadPerMillionUsd: 1,
		});
		expect(await json(await app.handle(admin("/local-prices")))).toEqual({
			items: [
				{
					model: "org/m",
					inputPerMillionUsd: 3,
					outputPerMillionUsd: 4,
					cacheReadPerMillionUsd: 1,
				},
			],
		});
		const gone = await app.handle(
			admin(`/local-prices/${encodeURIComponent("org/m")}`, {
				method: "DELETE",
			}),
		);
		expect((await json(gone)).items).toEqual([]);
	});
});
