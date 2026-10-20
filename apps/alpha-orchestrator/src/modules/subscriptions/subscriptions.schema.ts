import { t } from "elysia";

// Literals spelled out: `oneOf()` loses the literal types, which breaks handler typing.
const PlanStatus = t.Union([
	t.Literal("active"),
	t.Literal("canceling"),
	t.Literal("past_due"),
	t.Literal("ended"),
]);

export const SubscriptionsQuery = t.Object({
	status: t.Optional(PlanStatus),
});

export const SubscriptionParams = t.Object({ id: t.String() });

export const LinkChannelBody = t.Object({ channelId: t.Nullable(t.String()) });

/** A Polar subscription as the Plans tab shows it; `status` is derived from Polar's fields. */
export const Subscription = t.Object({
	id: t.String(),
	customerId: t.String(),
	customerEmail: t.Nullable(t.String()),
	plan: t.Nullable(t.String()),
	status: PlanStatus,
	startedAt: t.Nullable(t.Number()),
	/** When the paid period ends: the expiry date. */
	currentPeriodEnd: t.Nullable(t.Number()),
	endedAt: t.Nullable(t.Number()),
	channelId: t.Nullable(t.String()),
	channelName: t.Nullable(t.String()),
	/** Link to the subscription in Polar; `null` without a Polar dashboard URL. */
	polarUrl: t.Nullable(t.String()),
});

export const SubscriptionList = t.Object({ items: t.Array(Subscription) });
