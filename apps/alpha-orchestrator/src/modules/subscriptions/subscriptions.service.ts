import { eq } from "drizzle-orm";
import { channels, subscriptions } from "../database/database.schema.ts";
import type { Db } from "../database/database.ts";
import { DAY_MS } from "../http/http.service.ts";

export const PLAN_STATUSES = [
	"active",
	"canceling",
	"past_due",
	"ended",
] as const;
export type PlanStatus = (typeof PLAN_STATUSES)[number];

export class UnknownChannelError extends Error {}

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

function toView(
	row: SubscriptionRow,
	channelName: string | null,
	polarBaseUrl: string | undefined,
) {
	return {
		id: row.id,
		customerEmail: row.customerEmail,
		customerId: row.customerId,
		plan: row.productName,
		status: planStatus(row),
		startedAt: row.startedAt,
		currentPeriodEnd: row.currentPeriodEnd,
		endedAt: row.endedAt,
		channelId: row.channelId,
		channelName,
		polarUrl: polarBaseUrl
			? `${polarBaseUrl.replace(/\/+$/, "")}/${row.id}`
			: null,
	};
}

/** Plans expiring within 7 days first, then by expiry, ended ones last. */
export function listSubscriptions(
	db: Db,
	options: { status?: PlanStatus; now: number; polarBaseUrl?: string },
) {
	const names = new Map(
		db
			.select({ id: channels.id, name: channels.name })
			.from(channels)
			.all()
			.map((c) => [c.id, c.name]),
	);
	const rank = (s: ReturnType<typeof toView>) =>
		s.status === "ended"
			? 2
			: (s.currentPeriodEnd ?? Infinity) <= options.now + 7 * DAY_MS
				? 0
				: 1;
	return db
		.select()
		.from(subscriptions)
		.all()
		.map((row) =>
			toView(
				row,
				row.channelId ? (names.get(row.channelId) ?? null) : null,
				options.polarBaseUrl,
			),
		)
		.filter((s) => !options.status || s.status === options.status)
		.sort(
			(a, b) =>
				rank(a) - rank(b) ||
				(a.currentPeriodEnd ?? Infinity) - (b.currentPeriodEnd ?? Infinity) ||
				a.id.localeCompare(b.id),
		);
}

/** Links (or, with `null`, unlinks) a channel; `undefined` = no such subscription. */
export function linkChannel(
	db: Db,
	id: string,
	channelId: string | null,
	polarBaseUrl?: string,
) {
	const row = db
		.select()
		.from(subscriptions)
		.where(eq(subscriptions.id, id))
		.get();
	if (!row) return undefined;
	const channel = channelId
		? db.select().from(channels).where(eq(channels.id, channelId)).get()
		: undefined;
	if (channelId && !channel) throw new UnknownChannelError(channelId);
	db.update(subscriptions)
		.set({ channelId })
		.where(eq(subscriptions.id, id))
		.run();
	return toView({ ...row, channelId }, channel?.name ?? null, polarBaseUrl);
}
