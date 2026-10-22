import { type Static, t } from "elysia";
import { nullable, oneOf } from "../common/common.schema.ts";
import { Subscription } from "../subscriptions/subscriptions.schema.ts";

export const SUSPENSION_REASONS = [
	"no_plan",
	"plan_expired",
	"no_balance",
] as const;
const Reason = oneOf(SUSPENSION_REASONS);

/** The orchestrator's `GET /v1/admin/accounts/:accountId/billing` (admin-api.md). */
export const AccountBilling = t.Object({
	standing: t.Union([
		t.Object({ ok: t.Literal(true), until: nullable(t.Number()) }),
		t.Object({
			ok: t.Literal(false),
			reason: Reason,
			since: nullable(t.Number()),
		}),
	]),
	subscription: nullable(Subscription),
	/** TR, 1 TR = 1 USD; negative = overdraft. */
	balanceUsd: t.Number(),
	orders: t.Array(
		t.Object({
			id: t.String(),
			kind: oneOf(["plan", "credits"]),
			/** Cents. */
			amount: t.Number(),
			currency: t.String(),
			status: t.String(),
			createdAt: t.Number(),
			refundedAmount: t.Number(),
		}),
	),
	spend: t.Array(
		t.Object({
			month: t.String(),
			tokens: t.Number(),
			costUsd: nullable(t.Number()),
		}),
	),
});

/** What the header alerts need. `warn` = the yellow alert (low balance or plan ending soon). */
export const StandingView = t.Object({
	ok: t.Boolean(),
	reason: nullable(Reason),
	since: nullable(t.Number()),
	until: nullable(t.Number()),
	balanceUsd: t.Number(),
	warn: t.Boolean(),
});

export { CheckoutInput } from "../../forms/forms.ts";

export const UrlOut = t.Object({ url: t.String() });

export type AccountBilling = Static<typeof AccountBilling>;
export type StandingView = Static<typeof StandingView>;
