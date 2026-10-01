import { DAY_MS } from "../common/common.service.ts";
import type { FetchContext } from "../common/common.types.ts";
import type { DashboardData } from "../live/live.types.ts";

const byTokens = (
	a: { inputTokens: number; outputTokens: number },
	b: typeof a,
) => b.inputTokens + b.outputTokens - (a.inputTokens + a.outputTokens);

/**
 * `GET /api/dashboard`: stats plus 30 days of usage by day, top-10 users and
 * channels. The REST endpoint and the live topic both call this, so a pushed
 * snapshot is always identical to what `GET` would return.
 */
export async function fetchDashboard({
	orchestrator,
	now,
}: Pick<FetchContext, "orchestrator" | "now">): Promise<DashboardData> {
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
