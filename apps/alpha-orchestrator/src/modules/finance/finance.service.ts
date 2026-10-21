import { netProfit } from "@repo/tax";
import { and, gte, inArray, lte } from "drizzle-orm";
import { orders } from "../database/database.schema.ts";
import type { Db } from "../database/database.ts";
import type { Prices } from "../prices/prices.service.ts";
import { usageRows } from "../usage/usage.service.ts";

interface OrderMoney {
	amount: number;
	refundedAmount: number;
	currency: string;
}

/**
 * Money of a period in USD. Each order is taxed alone (the fixed fee is per
 * receipt) on what stayed after refunds; orders in other currencies are
 * counted in `skippedOrders`, not converted. `null` spend (no prices) makes the profit `null`.
 */
export function financeOf(rows: OrderMoney[], modelSpendUsd: number | null) {
	const usd = rows.filter((r) => r.currency.toLowerCase() === "usd");
	const kept = usd.map((r) => (r.amount - r.refundedAmount) / 100);
	const { revenue, losses, profit } = netProfit({
		orders: kept,
		modelSpend: modelSpendUsd ?? 0,
	});
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
	return financeOf(rows, spend);
}
