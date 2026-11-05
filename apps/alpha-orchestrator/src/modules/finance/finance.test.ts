import { describe, expect, test } from "bun:test";
import { financeSettings, orders } from "../database/database.schema.ts";
import { admin, json, NOW, setupAdminApp } from "../http/http.testing.ts";
import {
	DEFAULT_FINANCE_RATES,
	financeOf,
	ratesOf,
} from "./finance.service.ts";

const order = (amount: number, refundedAmount = 0, currency = "usd") => ({
	amount,
	refundedAmount,
	currency,
});

describe("financeOf", () => {
	test("one $10 order loses $2.04 (the commission doc's example)", () => {
		const f = financeOf([order(1000)], 1);
		expect(f.revenueUsd).toBe(10);
		expect(f.lossesUsd).toBeCloseTo(2.04, 2);
		expect(f.netProfitUsd).toBeCloseTo(10 - 2.04 - 1, 2);
		expect(f.ordersCount).toBe(1);
	});

	test("a refund shrinks revenue, a fully refunded order still pays the fixed fee", () => {
		const f = financeOf([order(1000, 400), order(500, 500)], 0);
		expect(f.revenueUsd).toBe(6);
		expect(f.lossesUsd).toBeCloseTo(
			financeOf([order(600)], 0).lossesUsd + financeOf([order(0)], 0).lossesUsd,
			6,
		);
		expect(financeOf([order(500, 500)], 0).lossesUsd).toBeGreaterThan(0.6);
		expect(f.ordersCount).toBe(2);
	});

	test("no orders: zeros, profit is minus the spend", () => {
		expect(financeOf([], 2)).toMatchObject({
			revenueUsd: 0,
			lossesUsd: 0,
			netProfitUsd: -2,
			ordersCount: 0,
		});
	});

	test("unknown spend gives null spend and profit; other currencies are skipped and counted", () => {
		const f = financeOf([order(1000), order(1000, 0, "eur")], null);
		expect(f.modelSpendUsd).toBeNull();
		expect(f.netProfitUsd).toBeNull();
		expect(f.ordersCount).toBe(1);
		expect(f.skippedOrders).toBe(1);
	});
});

describe("ratesOf", () => {
	test("the defaults are the commission doc's calculation", () => {
		const f = financeOf([order(1000)], 1, ratesOf(DEFAULT_FINANCE_RATES));
		expect(f.lossesUsd).toBeCloseTo(2.04, 2);
	});
});

describe("finance rates", () => {
	const rates = {
		feeFixedUsd: 0,
		feePercent: 10,
		payoutPercent: 0,
		taxPercent: 20,
		conversionPercent: 0,
		marginPercent: 15,
		taxBase: "revenue",
	};
	const put = (body: unknown) =>
		admin("/finance/rates", { method: "PUT", body });

	test("start from the defaults; saved rates are returned and change the numbers", async () => {
		const { db, app } = setupAdminApp();
		expect(await json(await app.handle(admin("/finance/rates")))).toEqual(
			DEFAULT_FINANCE_RATES,
		);
		db.insert(orders)
			.values({
				id: "o",
				accountId: "acc_1",
				kind: "plan",
				amount: 10000,
				currency: "usd",
				status: "paid",
				createdAt: NOW - 1000,
			})
			.run();
		expect((await app.handle(put(rates))).status).toBe(200);
		expect(await json(await app.handle(admin("/finance/rates")))).toEqual(
			rates,
		);
		const body = await json(await app.handle(admin("/finance")));
		expect(body.lossesUsd).toBeCloseTo(30, 6);
	});

	test("rates saved before marginPercent existed read with margin 0", async () => {
		const { db, app } = setupAdminApp();
		const { marginPercent, ...old } = rates;
		db.insert(financeSettings)
			.values({ id: 1, rates: old as never, updatedBy: "a", updatedAt: 1 })
			.run();
		expect(await json(await app.handle(admin("/finance/rates")))).toMatchObject(
			{ marginPercent: 0, feePercent: 10 },
		);
	});

	test("a rate above 100% or an unknown base is refused and nothing changes", async () => {
		const { app } = setupAdminApp();
		expect((await app.handle(put({ ...rates, taxPercent: 101 }))).status).toBe(
			422,
		);
		expect((await app.handle(put({ ...rates, taxBase: "x" }))).status).toBe(
			422,
		);
		expect(await json(await app.handle(admin("/finance/rates")))).toEqual(
			DEFAULT_FINANCE_RATES,
		);
	});
});

describe("GET /v1/admin/finance", () => {
	test("counts paid orders in the period only; no prices means null spend", async () => {
		const { db, app } = setupAdminApp();
		const row = (id: string, status: string, createdAt: number) => ({
			id,
			accountId: "acc_1",
			kind: "plan" as const,
			amount: 1000,
			currency: "usd",
			status,
			createdAt,
		});
		db.insert(orders)
			.values([
				row("in", "paid", NOW - 1000),
				row("pending", "pending", NOW - 1000),
				row("old", "paid", NOW - 90 * 86_400_000),
			])
			.run();
		const body = await json(await app.handle(admin("/finance")));
		expect(body.ordersCount).toBe(1);
		expect(body.revenueUsd).toBe(10);
		expect(body.modelSpendUsd).toBeNull();
		expect(body.netProfitUsd).toBeNull();
	});
});
