import { DAY_MS } from "../common/common.service.ts";
import type { FetchContext } from "../common/common.types.ts";
import type { DashboardData } from "../live/live.types.ts";

const byTokens = (
	a: { inputTokens: number; outputTokens: number },
	b: typeof a,
) => b.inputTokens + b.outputTokens - (a.inputTokens + a.outputTokens);

/**
 * `GET /api/dashboard`: stats plus 30 days of usage by day, top-10 visitors and
 * channels (of one owner when `ownerId` is given). The REST endpoint and the live topic both call this, so a pushed
 * snapshot is always identical to what `GET` would return.
 */
export async function fetchDashboard(
	{ orchestrator, now }: Pick<FetchContext, "orchestrator" | "now">,
	ownerId?: string,
): Promise<DashboardData> {
	const from = now() - 30 * DAY_MS;
	const [stats, byDay, byVisitor, byChannel, byModel] = await Promise.all([
		orchestrator.stats(ownerId),
		orchestrator.usage({ groupBy: "day", from, ownerId }),
		orchestrator.usage({ groupBy: "visitor", from, ownerId }),
		orchestrator.usage({ groupBy: "channel", from, ownerId }),
		orchestrator.usage({ groupBy: "model", from, ownerId }),
	]);
	return {
		stats,
		byDay: byDay.rows.map((row) => ({
			day: row.label,
			inputTokens: row.inputTokens,
			outputTokens: row.outputTokens,
			costUsd: row.costUsd,
		})),
		topVisitors: [...byVisitor.rows].sort(byTokens).slice(0, 10),
		byChannel: [...byChannel.rows].sort(byTokens),
		byModel: [...byModel.rows].sort(byTokens),
	};
}
