import type { Db } from "../database/database.ts";
import { dayOf, usageColumnsWhere } from "./usage.sql.ts";
import type { UsageTotals } from "./usage.types.ts";

export type UsageGroupBy = "day" | "user" | "channel" | "model";

/** What each grouping selects: the group key, its display label, and any join it needs. */
const GROUPS: Record<
	UsageGroupBy,
	{ key: string; label: string; join: string }
> = {
	day: { key: dayOf("l.at"), label: dayOf("l.at"), join: "" },
	user: {
		key: "l.user_id",
		// Deleted (e.g. cleaned-up anonymous) users have user_id NULL.
		label:
			"CASE WHEN l.user_id IS NULL THEN '(удалён)' ELSE COALESCE(u.display_name, u.external_user_id, u.id) END",
		join: "LEFT JOIN users u ON u.id = l.user_id",
	},
	channel: {
		key: "c.slug",
		label: "COALESCE(c.name, '(удалён)')",
		join: "LEFT JOIN channels c ON c.id = l.channel_id",
	},
	model: { key: "l.model", label: "l.model", join: "" },
};

export function usageRows(
	db: Db,
	groupBy: UsageGroupBy,
	from: number,
	to: number,
	channel?: string,
) {
	const group = GROUPS[groupBy];
	const channelFilter = channel
		? "AND l.channel_id = (SELECT id FROM channels WHERE slug = $channel)"
		: "";

	return db.$client
		.query<Record<string, unknown>, Record<string, string | number>>(
			`SELECT ${group.key} AS key, ${group.label} AS label,
				COALESCE(SUM(l.input_tokens), 0) AS inputTokens,
				COALESCE(SUM(l.output_tokens), 0) AS outputTokens,
				COUNT(*) AS calls,
				COALESCE(SUM(CASE WHEN l.input_tokens IS NULL OR l.output_tokens IS NULL THEN 1 ELSE 0 END), 0) AS callsWithoutUsage,
				CAST(ROUND(AVG(l.latency_ms)) AS INTEGER) AS avgLatencyMs
			FROM llm_calls l ${group.join}
			WHERE l.at >= $from AND l.at <= $to ${channelFilter}
			GROUP BY 1 ORDER BY 1`,
		)
		.all({ from, to, ...(channel ? { channel } : {}) });
}

/**
 * Token and call totals for each "since" time, read in a single pass over the
 * newest part of `llm_calls` (the windows overlap, so separate queries would
 * scan the same rows several times).
 */
export function usageSinceEach(db: Db, sinces: number[]): UsageTotals[] {
	if (sinces.length === 0) return [];
	const columns = sinces
		.map((_, i) => usageColumnsWhere(`w${i}`, `at >= $since${i}`))
		.join(",");
	const binds = Object.fromEntries(
		sinces.map((since, i) => [`since${i}`, since]),
	);
	const row = db.$client
		.query<Record<string, number>, Record<string, number>>(
			`SELECT ${columns} FROM llm_calls WHERE at >= $oldest`,
		)
		.get({ ...binds, oldest: Math.min(...sinces) });

	return sinces.map((_, i) => ({
		inputTokens: row?.[`w${i}InputTokens`] ?? 0,
		outputTokens: row?.[`w${i}OutputTokens`] ?? 0,
		calls: row?.[`w${i}Calls`] ?? 0,
		callsWithoutUsage: row?.[`w${i}CallsWithoutUsage`] ?? 0,
	}));
}
