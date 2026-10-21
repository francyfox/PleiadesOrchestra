import { type Static, t } from "elysia";
import { nullable } from "../common/common.schema.ts";

/** Staff money numbers of the dashboard period, USD (orchestrator `GET /v1/admin/finance`). */
export const Finance = t.Object({
	/** `null` when model prices could not be fetched. */
	modelSpendUsd: nullable(t.Number()),
	/** Paid USD orders net of refunds. */
	revenueUsd: t.Number(),
	/** Payment, payout, tax and conversion losses, per order. */
	lossesUsd: t.Number(),
	/** `null` when the spend is unknown. */
	netProfitUsd: nullable(t.Number()),
	ordersCount: t.Number(),
	/** Orders in other currencies, left out of the numbers. */
	skippedOrders: t.Number(),
});
export type Finance = Static<typeof Finance>;
