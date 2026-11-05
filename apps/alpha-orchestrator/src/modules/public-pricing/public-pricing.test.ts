import { describe, expect, test } from "bun:test";
import { creditFor } from "@repo/tax";
import { llmCalls } from "../database/database.schema.ts";
import { testDb } from "../database/database.testing.ts";
import { DEFAULT_FINANCE_RATES, ratesOf } from "../finance/finance.service.ts";
import { NOW, setupAdminApp } from "../http/http.testing.ts";
import { modelsOf, topUpsOf } from "./public-pricing.service.ts";

const rates = { ...DEFAULT_FINANCE_RATES, marginPercent: 20 };

function seed(db: ReturnType<typeof testDb>, model: string, ok = true) {
	db.insert(llmCalls)
		.values({
			at: NOW,
			kind: "generate",
			provider: "p",
			model,
			latencyMs: 1,
			ok,
		})
		.run();
}

describe("topUpsOf", () => {
	test("credit is billing's creditFor; paid = credited + fees and taxes + service", () => {
		for (const row of topUpsOf(rates)) {
			expect(row.creditedTr).toBeCloseTo(
				creditFor(row.paidUsd, ratesOf(rates), 0.2),
				2,
			);
			expect(row.creditedTr + row.feesAndTaxUsd + row.serviceUsd).toBeCloseTo(
				row.paidUsd,
				2,
			);
		}
		expect(topUpsOf(rates).map((r) => r.paidUsd)).toEqual([5, 10, 20, 50]);
	});

	test("no margin: no service share", () => {
		expect(topUpsOf(DEFAULT_FINANCE_RATES)[1]?.serviceUsd).toBe(0);
	});
});

describe("modelsOf", () => {
	test("priced models used by ok calls, sorted, per 1M; cacheRead only when set", () => {
		const db = testDb();
		seed(db, "b/model");
		seed(db, "a/model");
		seed(db, "unpriced");
		seed(db, "failed-only", false);
		const prices = new Map([
			["b/model", { input: 0.000001, output: 0.000004, cacheRead: 5e-7 }],
			["a/model", { input: 0.000002, output: 0.000008 }],
			["failed-only", { input: 1, output: 1 }],
			["never-used", { input: 1, output: 1 }],
		]);
		expect(modelsOf(db, prices)).toEqual([
			{ id: "a/model", inputPerMillionTr: 2, outputPerMillionTr: 8 },
			{
				id: "b/model",
				inputPerMillionTr: 1,
				outputPerMillionTr: 4,
				cacheReadPerMillionTr: 0.5,
			},
		]);
		expect(modelsOf(db, prices, 1)).toHaveLength(1);
	});

	test("prices unavailable: empty list", () => {
		expect(modelsOf(testDb(), null)).toEqual([]);
	});
});

describe("GET /v1/public/pricing", () => {
	test("needs no key, is cacheable and never names internal rates", async () => {
		const { app } = setupAdminApp();
		const response = await app.handle(
			new Request("http://localhost/v1/public/pricing"),
		);
		expect(response.status).toBe(200);
		expect(response.headers.get("cache-control")).toBe("public, max-age=300");
		const text = await response.text();
		expect(JSON.parse(text)).toMatchObject({
			currency: "USD",
			models: [],
			updatedAt: NOW,
		});
		expect(text).not.toMatch(/polar|payout|conversion|taxRate/i);
	});
});
