import { orError } from "$lib/server/admin-api";
import { services } from "$lib/server/services";
import type { PageServerLoad } from "./$types";

const DAY = 24 * 60 * 60 * 1000;

export const load: PageServerLoad = async () => {
	const { orchestrator } = services();
	const from = Date.now() - 30 * DAY;
	const [stats, byDay, byUser, byChannel] = await orError(
		Promise.all([
			orchestrator.stats(),
			orchestrator.usage({ groupBy: "day", from }),
			orchestrator.usage({ groupBy: "user", from }),
			orchestrator.usage({ groupBy: "channel", from }),
		]),
	);
	const byTokens = (
		a: { inputTokens: number; outputTokens: number },
		b: typeof a,
	) => b.inputTokens + b.outputTokens - (a.inputTokens + a.outputTokens);
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
};
