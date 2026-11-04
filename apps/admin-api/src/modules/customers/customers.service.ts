import { and, eq, sql } from "drizzle-orm";
import { LEVEL } from "../accounts/accounts.schema.ts";
import { type AdminDb, schema } from "../database/database.ts";
import type { OrchestratorClient } from "../orchestrator/orchestrator.ts";
import type { Subscription } from "../subscriptions/subscriptions.schema.ts";
import type {
	Customer,
	CustomersPage,
	CustomersQuery,
	CustomersSort,
} from "./customers.schema.ts";

const customers = eq(schema.user.level, LEVEL.user);

export async function findCustomer(db: AdminDb, id: string) {
	const [row] = await db
		.select()
		.from(schema.user)
		.where(and(eq(schema.user.id, id), customers));
	return row ?? null;
}

/**
 * `GET /api/accounts`: level-200 accounts with how many channels each owns,
 * their current plan and TR balance; `q` keeps emails containing it (any
 * case), then sorted (default: oldest first) and paged. shortcut: every
 * customer, one unpaged channel list, one subscription list and one balance
 * list are merged in memory so any column can sort; page in SQL with the
 * orchestrator's numbers per owner when there are thousands of accounts.
 */
export async function fetchCustomersPage(
	{ db, orchestrator }: { db: AdminDb; orchestrator: OrchestratorClient },
	query: CustomersQuery,
): Promise<CustomersPage> {
	const q = query.q?.trim().toLowerCase();
	const [
		rows,
		{ items: channels },
		{ items: subscriptions },
		{ items: balances },
	] = await Promise.all([
		db
			.select()
			.from(schema.user)
			.where(
				q
					? and(customers, sql`instr(lower(${schema.user.email}), ${q}) > 0`)
					: customers,
			),
		orchestrator.listChannels(),
		orchestrator.listSubscriptions(),
		orchestrator.listBalances(),
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
	const balance = new Map(balances.map((b) => [b.accountId, b.balanceUsd]));
	const items: Customer[] = rows.map((user) => ({
		id: user.id,
		name: user.name,
		email: user.email,
		emailVerified: user.emailVerified,
		createdAt: user.createdAt.getTime(),
		lastActiveAt: user.lastActiveAt?.getTime() ?? null,
		banned: user.banned === true,
		channelsCount: owned.get(user.id) ?? 0,
		balanceUsd: balance.get(user.id) ?? 0,
		plan: planOf(plans.get(user.id)),
	}));
	const sign = query.order === "desc" ? -1 : 1;
	const key = SORT_KEYS[query.sort ?? "createdAt"];
	items.sort(
		(a, b) => compare(key(a), key(b), sign) || a.id.localeCompare(b.id),
	);
	const start = ((query.page ?? 1) - 1) * (query.pageSize ?? 0);
	return {
		items: query.pageSize ? items.slice(start, start + query.pageSize) : items,
		total: items.length,
	};
}

const PLAN_RANK = { active: 0, canceling: 1, past_due: 2, ended: 3 } as const;

const SORT_KEYS: Record<
	CustomersSort,
	(c: Customer) => string | number | null
> = {
	name: (c) => c.name.toLowerCase(),
	email: (c) => c.email.toLowerCase(),
	createdAt: (c) => c.createdAt,
	lastActiveAt: (c) => c.lastActiveAt,
	channelsCount: (c) => c.channelsCount,
	balanceUsd: (c) => c.balanceUsd,
	plan: (c) => (c.plan ? PLAN_RANK[c.plan.status] : null),
	paidUntil: (c) => c.plan?.currentPeriodEnd ?? null,
	banned: (c) => Number(c.banned),
};

/** Nulls (never active, no plan) go last in either order. */
function compare(
	a: string | number | null,
	b: string | number | null,
	sign: number,
): number {
	if (a === b) return 0;
	if (a === null) return 1;
	if (b === null) return -1;
	return (a < b ? -1 : 1) * sign;
}

/** A plan that has not ended beats one that has; then the later period end. */
const isNewer = (a: Subscription, b: Subscription) =>
	a.status !== "ended" && b.status === "ended"
		? true
		: (a.status === "ended") === (b.status === "ended") &&
			(a.currentPeriodEnd ?? 0) > (b.currentPeriodEnd ?? 0);

const planOf = (sub: Subscription | undefined) =>
	sub ? { status: sub.status, currentPeriodEnd: sub.currentPeriodEnd } : null;
