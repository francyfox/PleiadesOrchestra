import { eq } from "drizzle-orm";
import { subscriptions } from "../database/database.schema.ts";
import type { Db } from "../database/database.ts";
import { DAY_MS } from "../http/http.service.ts";

export const PLAN_STATUSES = [
	"active",
	"canceling",
	"past_due",
	"ended",
] as const;
export type PlanStatus = (typeof PLAN_STATUSES)[number];

type SubscriptionRow = typeof subscriptions.$inferSelect;

/**
 * What the panel shows. shortcut: `incomplete` and `unpaid` count as `past_due`
 * ("needs a payment"); split them if the panel has to tell them apart.
 */
export function planStatus(row: SubscriptionRow): PlanStatus {
	if (
		row.endedAt !== null ||
		row.status === "canceled" ||
		row.status === "incomplete_expired"
	)
		return "ended";
	if (row.status === "active" || row.status === "trialing")
		return row.cancelAtPeriodEnd ? "canceling" : "active";
	return "past_due";
}

export function toView(row: SubscriptionRow, polarBaseUrl: string | undefined) {
	return {
		id: row.id,
		customerEmail: row.customerEmail,
		customerId: row.customerId,
		plan: row.productName,
		status: planStatus(row),
		startedAt: row.startedAt,
		currentPeriodEnd: row.currentPeriodEnd,
		endedAt: row.endedAt,
		accountId: row.accountId,
		polarUrl: polarBaseUrl
			? `${polarBaseUrl.replace(/\/+$/, "")}/${row.id}`
			: null,
	};
}

/** Plans expiring within 7 days first, then by expiry, ended ones last. */
export function listSubscriptions(
	db: Db,
	options: {
		status?: PlanStatus;
		accountId?: string;
		now: number;
		polarBaseUrl?: string;
	},
) {
	const rank = (s: ReturnType<typeof toView>) =>
		s.status === "ended"
			? 2
			: (s.currentPeriodEnd ?? Infinity) <= options.now + 7 * DAY_MS
				? 0
				: 1;
	return db
		.select()
		.from(subscriptions)
		.where(
			options.accountId
				? eq(subscriptions.accountId, options.accountId)
				: undefined,
		)
		.all()
		.map((row) => toView(row, options.polarBaseUrl))
		.filter((s) => !options.status || s.status === options.status)
		.sort(
			(a, b) =>
				rank(a) - rank(b) ||
				(a.currentPeriodEnd ?? Infinity) - (b.currentPeriodEnd ?? Infinity) ||
				a.id.localeCompare(b.id),
		);
}
