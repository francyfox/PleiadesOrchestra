import { DEFAULT_RATES, netProfit, type Rates } from "@repo/tax";
import { and, eq, gte, inArray, lte } from "drizzle-orm";
import { financeSettings, orders } from "../database/database.schema.ts";
import type { Db } from "../database/database.ts";
import type { Prices } from "../prices/prices.service.ts";
import { usageRows } from "../usage/usage.service.ts";
import type { FinanceRatesValue } from "./finance.schema.ts";

interface OrderMoney {
	amount: number;
	refundedAmount: number;
	currency: string;
}

/** What `@repo/tax` computes with when staff never saved rates (percent). */
export const DEFAULT_FINANCE_RATES: FinanceRatesValue = {
	feeFixedUsd: DEFAULT_RATES.polarFixed,
	feePercent: 7.9,
	payoutPercent: 1.5,
	taxPercent: 3,
	conversionPercent: 2,
	marginPercent: 0,
	taxBase: "payout",
};

/** Percent on the wire and in the DB, shares in `@repo/tax`. */
export function ratesOf(p: FinanceRatesValue): Rates {
	return {
		polarFixed: p.feeFixedUsd,
		polarRate: p.feePercent / 100,
		payoutRate: p.payoutPercent / 100,
		taxRate: p.taxPercent / 100,
		conversionRate: p.conversionPercent / 100,
		taxBase: p.taxBase,
	};
}

/** Defaults fill fields that older saved rates lack (`marginPercent`). */
export function readFinanceRates(db: Pick<Db, "select">): FinanceRatesValue {
	const saved = db
		.select()
		.from(financeSettings)
		.where(eq(financeSettings.id, 1))
		.get()?.rates;
	const rates = { ...DEFAULT_FINANCE_RATES, ...saved };
	// A removed base ("profit") saved earlier falls back to the default.
	if (!["payout", "revenue"].includes(rates.taxBase)) rates.taxBase = "payout";
	return rates;
}

export function saveFinanceRates(
	db: Db,
	rates: FinanceRatesValue,
	adminId: string,
	now: number,
) {
	const values = { rates, updatedBy: adminId, updatedAt: now };
	db.insert(financeSettings)
		.values({ id: 1, ...values })
		.onConflictDoUpdate({ target: financeSettings.id, set: values })
		.run();
}

/**
 * Money of a period in USD. Each order is taxed alone (the fixed fee is per
 * receipt) on what stayed after refunds; orders in other currencies are
 * counted in `skippedOrders`, not converted. `null` spend (no prices) makes the profit `null`.
 */
export function financeOf(
	rows: OrderMoney[],
	modelSpendUsd: number | null,
	rates: Rates = DEFAULT_RATES,
) {
	const usd = rows.filter((r) => r.currency.toLowerCase() === "usd");
	const kept = usd.map((r) => (r.amount - r.refundedAmount) / 100);
	// Unknown spend counts as 0; the profit itself stays null.
	const { revenue, losses, profit } = netProfit(
		{ orders: kept, modelSpend: modelSpendUsd ?? 0 },
		rates,
	);
	return {
		modelSpendUsd,
		revenueUsd: revenue,
		lossesUsd: losses,
		netProfitUsd: modelSpendUsd === null ? null : profit,
		ordersCount: usd.length,
		skippedOrders: rows.length - usd.length,
	};
}

/** Paid (also refunded) orders created in `[from, to]` plus `llm_calls` spend over the same period. */
export function financeReport(
	db: Db,
	from: number,
	to: number,
	prices: Prices | null,
) {
	const spend = prices
		? usageRows(db, "model", from, to, undefined, prices).reduce(
				(sum, row) => sum + (row.costUsd ?? 0),
				0,
			)
		: null;
	const rows = db
		.select()
		.from(orders)
		.where(
			and(
				inArray(orders.status, ["paid", "partially_refunded", "refunded"]),
				gte(orders.createdAt, from),
				lte(orders.createdAt, to),
			),
		)
		.all();
	return financeOf(rows, spend, ratesOf(readFinanceRates(db)));
}
