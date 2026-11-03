import { and, asc, count, eq } from "drizzle-orm";
import { LEVEL } from "../accounts/accounts.schema.ts";
import type { PageQuery } from "../common/common.schema.ts";
import { type AdminDb, schema } from "../database/database.ts";
import type { OrchestratorClient } from "../orchestrator/orchestrator.ts";
import type { Subscription } from "../subscriptions/subscriptions.schema.ts";
import type { CustomersPage } from "./customers.schema.ts";

const customers = eq(schema.user.level, LEVEL.user);

export async function findCustomer(db: AdminDb, id: string) {
	const [row] = await db
		.select()
		.from(schema.user)
		.where(and(eq(schema.user.id, id), customers));
	return row ?? null;
}

/**
 * `GET /api/accounts`: level-200 accounts, oldest first, with how many channels
 * each owns and their current plan. shortcut: counts and plans come from one
 * unpaged channel list and one subscription list, grouped here; ask the
 * orchestrator per owner when those lists get long.
 */
export async function fetchCustomersPage(
	{ db, orchestrator }: { db: AdminDb; orchestrator: OrchestratorClient },
	query: PageQuery,
): Promise<CustomersPage> {
	const ordered = db
		.select()
		.from(schema.user)
		.where(customers)
		.orderBy(asc(schema.user.createdAt), asc(schema.user.id));
	const [rows, { items: channels }, { items: subscriptions }, [total]] =
		await Promise.all([
			query.pageSize
				? ordered
						.limit(query.pageSize)
						.offset(((query.page ?? 1) - 1) * query.pageSize)
				: ordered,
			orchestrator.listChannels(),
			orchestrator.listSubscriptions(),
			db.select({ value: count() }).from(schema.user).where(customers),
		]);
	const owned = new Map<string, number>();
	for (const { ownerId } of channels) {
		if (ownerId) owned.set(ownerId, (owned.get(ownerId) ?? 0) + 1);
	}
	const plans = new Map<string, Subscription>();
	for (const sub of subscriptions) {
		const best = plans.get(sub.accountId);
		if (!best || isNewer(sub, best)) plans.set(sub.accountId, sub);
	}
	return {
		items: rows.map((user) => ({
			id: user.id,
			name: user.name,
			email: user.email,
			emailVerified: user.emailVerified,
			createdAt: user.createdAt.getTime(),
			lastActiveAt: user.lastActiveAt?.getTime() ?? null,
			banned: user.banned === true,
			channelsCount: owned.get(user.id) ?? 0,
			plan: planOf(plans.get(user.id)),
		})),
		total: total?.value ?? 0,
	};
}

/** A plan that has not ended beats one that has; then the later period end. */
const isNewer = (a: Subscription, b: Subscription) =>
	a.status !== "ended" && b.status === "ended"
		? true
		: (a.status === "ended") === (b.status === "ended") &&
			(a.currentPeriodEnd ?? 0) > (b.currentPeriodEnd ?? 0);

const planOf = (sub: Subscription | undefined) =>
	sub ? { status: sub.status, currentPeriodEnd: sub.currentPeriodEnd } : null;
