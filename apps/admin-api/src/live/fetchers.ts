import { asc, count } from "drizzle-orm";
import { type AdminDb, schema, superAdminId } from "../db/index.ts";
import type { OrchestratorClient } from "../orchestrator/client.ts";
import type { AdminsPage } from "../schemas/accounts.ts";
import type { PerformanceReport } from "../schemas/orchestrator.ts";
import type { DashboardData, PageParams } from "./protocol.ts";

/** Everything the data behind an admin page is read from. */
export interface FetchContext {
	orchestrator: OrchestratorClient;
	db: AdminDb;
	now: () => number;
}

export const DAY_MS = 24 * 60 * 60 * 1000;

const byTokens = (
	a: { inputTokens: number; outputTokens: number },
	b: typeof a,
) => b.inputTokens + b.outputTokens - (a.inputTokens + a.outputTokens);

/**
 * The functions below are the ONE place a page's data is produced: the REST
 * endpoints and the live topics both call them, so a pushed snapshot is
 * always identical to what `GET` would have returned.
 */

/** `GET /api/dashboard`: stats plus 30 days of usage by day, top-10 users and channels. */
export async function fetchDashboard({
	orchestrator,
	now,
}: FetchContext): Promise<DashboardData> {
	const from = now() - 30 * DAY_MS;
	const [stats, byDay, byUser, byChannel] = await Promise.all([
		orchestrator.stats(),
		orchestrator.usage({ groupBy: "day", from }),
		orchestrator.usage({ groupBy: "user", from }),
		orchestrator.usage({ groupBy: "channel", from }),
	]);
	return {
		stats,
		byDay: byDay.rows.map((row) => ({
			day: row.label,
			inputTokens: row.inputTokens,
			outputTokens: row.outputTokens,
		})),
		topUsers: [...byUser.rows].sort(byTokens).slice(0, 10),
		byChannel: [...byChannel.rows].sort(byTokens),
	};
}

/** `GET /api/performance`: latency percentiles, by default over the last 30 days. */
export function fetchPerformance(
	{ orchestrator, now }: FetchContext,
	query: { from?: number },
): Promise<PerformanceReport> {
	return orchestrator.performance({ from: query.from ?? now() - 30 * DAY_MS });
}

/** `GET /api/admins`: oldest first (the super admin leads); `pageSize` omitted → every account. */
export async function fetchAdminsPage(
	{ db }: FetchContext,
	query: PageParams,
): Promise<AdminsPage> {
	const superId = await superAdminId(db);
	const ordered = db
		.select()
		.from(schema.user)
		.orderBy(asc(schema.user.createdAt), asc(schema.user.id));
	const rows = query.pageSize
		? await ordered
				.limit(query.pageSize)
				.offset(((query.page ?? 1) - 1) * query.pageSize)
		: await ordered;
	const [totalRow] = await db.select({ value: count() }).from(schema.user);
	return {
		admins: rows.map((user) => ({
			id: user.id,
			name: user.name,
			email: user.email,
			banned: user.banned === true,
			banReason: user.banReason ?? null,
			createdAt: user.createdAt.getTime(),
			isSuper: user.id === superId,
		})),
		total: totalRow?.value ?? 0,
	};
}
