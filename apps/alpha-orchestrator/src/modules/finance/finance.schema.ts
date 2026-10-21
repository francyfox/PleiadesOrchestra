import { t } from "elysia";

export const FinanceQuery = t.Object({
	/** Period start, epoch ms (default: 30 days ago). */
	from: t.Optional(t.Numeric()),
	/** Period end, epoch ms (default: now). */
	to: t.Optional(t.Numeric()),
});

export const Finance = t.Object({
	/** `null` when model prices could not be fetched. */
	modelSpendUsd: t.Nullable(t.Number()),
	/** Paid USD orders net of refunds. */
	revenueUsd: t.Number(),
	/** Payment, payout, tax and conversion losses, per order. */
	lossesUsd: t.Number(),
	/** Revenue - losses - model spend; `null` when the spend is unknown. */
	netProfitUsd: t.Nullable(t.Number()),
	ordersCount: t.Number(),
	/** Orders in other currencies, left out of every number above. */
	skippedOrders: t.Number(),
});
