import { type Static, t } from "elysia";
import { nullable, oneOf } from "../common/common.schema.ts";

export const PLAN_STATUSES = [
	"active",
	"canceling",
	"past_due",
	"ended",
] as const;
export const PlanStatus = oneOf(PLAN_STATUSES);

/** A Polar subscription as the Plans tab shows it; `status` is derived from Polar's fields. */
export const Subscription = t.Object({
	id: t.String(),
	customerId: t.String(),
	customerEmail: nullable(t.String()),
	plan: nullable(t.String()),
	status: PlanStatus,
	startedAt: nullable(t.Number()),
	/** When the paid period ends: the expiry date. */
	currentPeriodEnd: nullable(t.Number()),
	endedAt: nullable(t.Number()),
	channelId: nullable(t.String()),
	channelName: nullable(t.String()),
	/** Link to the subscription in Polar; `null` when the orchestrator has no `POLAR_DASHBOARD_URL`. */
	polarUrl: nullable(t.String()),
});

export type Subscription = Static<typeof Subscription>;
export type PlanStatus = Static<typeof PlanStatus>;
