import { t } from "elysia";
import { Subscription } from "../subscriptions/subscriptions.schema.ts";

export const AccountParams = t.Object({ accountId: t.String() });

const Standing = t.Union([
	t.Object({
		ok: t.Literal(true),
		/** Epoch ms the plan holds until (a canceled/past_due plan's paid period); `null` = until a webhook says otherwise. */
		until: t.Nullable(t.Number()),
	}),
	t.Object({
		ok: t.Literal(false),
		reason: t.Union([
			t.Literal("no_plan"),
			t.Literal("plan_expired"),
			t.Literal("no_balance"),
		]),
		/** Epoch ms the plan ended (`plan_expired`); `null` when unknown. */
		since: t.Nullable(t.Number()),
	}),
]);

const Order = t.Object({
	id: t.String(),
	kind: t.Union([t.Literal("plan"), t.Literal("credits")]),
	/** Cents. */
	amount: t.Number(),
	currency: t.String(),
	status: t.String(),
	createdAt: t.Number(),
	/** Cents. */
	refundedAmount: t.Number(),
});

export const AccountBilling = t.Object({
	standing: Standing,
	subscription: t.Nullable(Subscription),
	/** TR balance (1 TR = 1 USD); negative = overdraft. */
	balanceUsd: t.Number(),
	/** Newest first. */
	orders: t.Array(Order),
	/** Per UTC month, oldest first, over the account's channels; `costUsd` is `null` when model prices are unknown. */
	spend: t.Array(
		t.Object({
			month: t.String(),
			tokens: t.Number(),
			costUsd: t.Nullable(t.Number()),
		}),
	),
});
