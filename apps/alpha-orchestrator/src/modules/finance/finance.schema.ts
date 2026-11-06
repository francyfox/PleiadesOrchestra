import { type Static, t } from "elysia";

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

const Percent = t.Number({ minimum: 0, maximum: 100 });

/** Staff-editable rates, in percent (fixed fee in USD). */
export const FinanceRates = t.Object({
	feeFixedUsd: t.Number({ minimum: 0 }),
	feePercent: Percent,
	payoutPercent: Percent,
	taxPercent: Percent,
	conversionPercent: Percent,
	/** Share of the net (after fees and tax) kept by the shop when a payment is turned into TR; below 100 so a top-up never gives 0. */
	marginPercent: t.Number({ minimum: 0, maximum: 99 }),
	taxBase: t.UnionEnum(["payout", "revenue"]),
});

export type FinanceRatesValue = Static<typeof FinanceRates>;
