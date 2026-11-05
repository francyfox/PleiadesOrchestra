import { desc, eq, sql } from "drizzle-orm";
import {
	creditLedger,
	orders,
	subscriptions,
} from "../database/database.schema.ts";
import type { Db } from "../database/database.ts";
import { balanceNano, NANO_USD } from "../ledger/ledger.service.ts";
import { costUsd, type Prices } from "../prices/prices.service.ts";
import { accountStanding } from "../standing/standing.service.ts";
import { toView } from "../subscriptions/subscriptions.service.ts";
import { monthOf } from "../usage/usage.sql.ts";

/** Spend per month over the channels the account owns (calls of deleted channels are gone from it). */
function monthlySpend(db: Db, accountId: string, prices: Prices | null) {
	const rows = db.$client
		.query<
			{
				month: string;
				model: string;
				input: number;
				cached: number;
				output: number;
			},
			{ accountId: string }
		>(
			`SELECT ${monthOf("at")} AS month, model,
				COALESCE(SUM(input_tokens), 0) AS input, COALESCE(SUM(cache_read_tokens), 0) AS cached,
				COALESCE(SUM(output_tokens), 0) AS output
			FROM llm_calls
			WHERE ok = 1 AND channel_id IN (SELECT id FROM channels WHERE owner_id = $accountId)
			GROUP BY 1, 2 ORDER BY 1`,
		)
		.all({ accountId });
	const months = new Map<string, { tokens: number; costUsd: number | null }>();
	for (const row of rows) {
		const month = months.get(row.month) ?? {
			tokens: 0,
			costUsd: prices ? 0 : null,
		};
		month.tokens += row.input + row.output;
		if (prices)
			month.costUsd =
				(month.costUsd ?? 0) +
				costUsd(row.input, row.output, prices.get(row.model), row.cached);
		months.set(row.month, month);
	}
	return [...months].map(([month, v]) => ({ month, ...v }));
}

/** The plan in effect (running first), else the one whose paid period ended last. */
function currentSubscription(db: Db, accountId: string) {
	const rows = db
		.select()
		.from(subscriptions)
		.where(eq(subscriptions.accountId, accountId))
		.all();
	const running = (r: (typeof rows)[number]) =>
		r.status === "active" || r.status === "trialing";
	return rows.sort(
		(a, b) =>
			Number(running(b)) - Number(running(a)) ||
			(b.currentPeriodEnd ?? 0) - (a.currentPeriodEnd ?? 0),
	)[0];
}

/** Whether the account's channels may serve right now (reads the plan and the balance). */
export function standingOf(db: Db, accountId: string, now: number) {
	return accountStanding(
		currentSubscription(db, accountId) ?? null,
		balanceNano(db, accountId),
		now,
	);
}

/** Every account that has ledger rows, with its TR balance (staff Users table). */
export function listBalances(db: Db) {
	return db
		.select({
			accountId: creditLedger.accountId,
			total: sql<number>`SUM(${creditLedger.amount})`,
		})
		.from(creditLedger)
		.groupBy(creditLedger.accountId)
		.orderBy(creditLedger.accountId)
		.all()
		.map(({ accountId, total }) => ({
			accountId,
			balanceUsd: total / NANO_USD,
		}));
}

/** Everything the Billing page needs about one account. */
export function accountBilling(
	db: Db,
	accountId: string,
	options: { now: number; prices: Prices | null; polarBaseUrl?: string },
) {
	const current = currentSubscription(db, accountId);
	const balance = balanceNano(db, accountId);
	return {
		standing: accountStanding(current ?? null, balance, options.now),
		subscription: current ? toView(current, options.polarBaseUrl) : null,
		balanceUsd: balance / NANO_USD,
		orders: db
			.select()
			.from(orders)
			.where(eq(orders.accountId, accountId))
			.orderBy(desc(orders.createdAt))
			.all()
			.map(({ accountId: _, productId: __, ...order }) => order),
		spend: monthlySpend(db, accountId, options.prices),
	};
}

/** A staff correction of the TR balance (signed USD, kept to the nano-USD); `adminId` is the ledger ref. */
export function adjustBalance(
	db: Db,
	accountId: string,
	amountUsd: number,
	adminId: string,
	now: number,
) {
	db.insert(creditLedger)
		.values({
			accountId,
			amount: Math.round(amountUsd * NANO_USD),
			reason: "adjustment",
			ref: adminId,
			createdAt: now,
		})
		.run();
}

/**
 * A plan granted by staff, outside Polar: one row `manual:<accountId>` that
 * runs until `until` and does not renew; `null` ends it now. It only shows
 * the plan: the balance is topped up separately (`adjustBalance`).
 * shortcut: after `until` it still reads `canceling` (no webhook ends it), so
 * a zero balance says `no_balance`, not `plan_expired`; end it with `null`.
 */
export function setManualPlan(
	db: Db,
	accountId: string,
	until: number | null,
	now: number,
) {
	const values = {
		accountId,
		customerId: "manual",
		productName: "Manual",
		status: until === null ? "canceled" : "active",
		startedAt: now,
		currentPeriodStart: now,
		currentPeriodEnd: until ?? now,
		cancelAtPeriodEnd: true,
		endedAt: until === null ? now : null,
		updatedAt: now,
	};
	const { startedAt: _, ...update } = values;
	db.insert(subscriptions)
		.values({ id: `manual:${accountId}`, ...values })
		.onConflictDoUpdate({ target: subscriptions.id, set: update })
		.run();
}
