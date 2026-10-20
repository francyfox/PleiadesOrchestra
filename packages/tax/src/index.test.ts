import { expect, test } from "bun:test";
import { DEFAULT_RATES, netProfit, orderBreakdown } from "./index.ts";

test("doc example P = 10", () => {
	const b = orderBreakdown(10);
	expect(b.polarFee).toBeCloseTo(1.49, 5);
	expect(b.netPolar).toBeCloseTo(8.51, 5);
	expect(b.payout).toBeCloseTo(8.38, 2);
	expect(b.losses).toBeCloseTo(2.04, 2);
	expect(b.lossShare).toBeCloseTo(0.204, 3);
	expect(b.net).toBeCloseTo(10 - b.losses, 10);
});

test("P = 0 has zero lossShare", () => {
	const b = orderBreakdown(0);
	expect(b.lossShare).toBe(0);
	expect(b.polarFee).toBeCloseTo(0.7, 10);
});

test("price below the fixed fee gives negative net", () => {
	expect(orderBreakdown(0.5).net).toBeLessThan(0);
});

test("custom rates override", () => {
	const rates = {
		...DEFAULT_RATES,
		polarFixed: 0,
		polarRate: 0.1,
		payoutRate: 0,
		taxRate: 0,
		conversionRate: 0,
	};
	const b = orderBreakdown(100, rates);
	expect(b.losses).toBeCloseTo(10, 10);
	expect(b.net).toBeCloseTo(90, 10);
});

test("several orders vs one big order differ by the fixed fees", () => {
	const many = netProfit({ orders: [10, 10, 10], modelSpend: 0 });
	const one = netProfit({ orders: [30], modelSpend: 0 });
	expect(many.revenue).toBe(one.revenue);
	expect(many.losses).toBeGreaterThan(one.losses);
	// each extra fixed fee F lowers the Polar balance, so downstream fees shrink by the same share
	expect(many.losses - one.losses).toBeCloseTo(
		2 * 0.7 * (1 - 0.015 - 0.985 * 0.05),
		10,
	);
});

test("profit subtracts model spend", () => {
	const r = netProfit({ orders: [10], modelSpend: 1.5 });
	expect(r.profit).toBeCloseTo(10 - r.losses - 1.5, 10);
});

test("invalid inputs throw RangeError", () => {
	expect(() => orderBreakdown(-1)).toThrow(RangeError);
	expect(() => orderBreakdown(Number.NaN)).toThrow(RangeError);
	expect(() =>
		netProfit({ orders: [Number.POSITIVE_INFINITY], modelSpend: 0 }),
	).toThrow(RangeError);
	expect(() => netProfit({ orders: [1], modelSpend: -1 })).toThrow(RangeError);
});
