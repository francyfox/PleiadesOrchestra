import type { Db } from "../database/database.ts";
import { costUsd, type Prices } from "../prices/prices.service.ts";
import { dayOf, usageColumnsWhere } from "./usage.sql.ts";
import type { UsageTotals } from "./usage.types.ts";

export type UsageGroupBy = "day" | "visitor" | "channel" | "model";

/** What each grouping selects: the group key, its display label, and any join it needs. */
const GROUPS: Record<
	UsageGroupBy,
	{ key: string; label: string; join: string }
> = {
	day: { key: dayOf("l.at"), label: dayOf("l.at"), join: "" },
	visitor: {
		key: "l.visitor_id",
		// Deleted (e.g. cleaned-up anonymous) visitors have visitor_id NULL.
		label:
			"CASE WHEN l.visitor_id IS NULL THEN '(удалён)' ELSE COALESCE(u.display_name, NULLIF(u.name, ''), u.id) END",
		join: "LEFT JOIN visitors u ON u.id = l.visitor_id",
	},
	channel: {
		key: "c.slug",
		label: "COALESCE(c.name, '(удалён)')",
		join: "LEFT JOIN channels c ON c.id = l.channel_id",
	},
	model: { key: "l.model", label: "l.model", join: "" },
};

interface UsageRowBase extends UsageTotals {
	key: string | null;
	label: string;
	avgLatencyMs: number;
}

/** `channel` = a slug; `ownerId` = only calls of that account's channels (calls of deleted channels have no owner). */
const filterOf = (channel?: string, ownerId?: string) =>
	`${channel ? "AND l.channel_id = (SELECT id FROM channels WHERE slug = $channel)" : ""}
	${ownerId ? "AND l.channel_id IN (SELECT id FROM channels WHERE owner_id = $ownerId)" : ""}`;

const bindsOf = (channel?: string, ownerId?: string) => ({
	...(channel ? { channel } : {}),
	...(ownerId ? { ownerId } : {}),
});

/**
 * Spend per group key: tokens × the model's price. `null` without prices (the
 * list could not be fetched); a model with no price is local and costs 0.
 * shortcut: today's price is applied to past tokens; store a price per call
 * (PO-8 `costUsd`) when prices change often or the figure is billed.
 */
function spendByKey(
	db: Db,
	groupBy: UsageGroupBy,
	from: number,
	to: number,
	channel: string | undefined,
	prices: Prices,
	ownerId?: string,
) {
	const group = GROUPS[groupBy];
	const perModel = db.$client
		.query<
			{ key: string | null; model: string; input: number; output: number },
			Record<string, string | number>
		>(
			`SELECT ${group.key} AS key, l.model AS model,
				COALESCE(SUM(l.input_tokens), 0) AS input,
				COALESCE(SUM(l.output_tokens), 0) AS output
			FROM llm_calls l ${group.join}
			WHERE l.at >= $from AND l.at <= $to ${filterOf(channel, ownerId)}
			GROUP BY 1, 2`,
		)
		.all({ from, to, ...bindsOf(channel, ownerId) });
	const spend = new Map<string | null, number>();
	for (const row of perModel) {
		spend.set(
			row.key,
			(spend.get(row.key) ?? 0) +
				costUsd(row.input, row.output, prices.get(row.model)),
		);
	}
	return spend;
}

/** Usage grouped by day, visitor, channel or model; `prices` adds `costUsd` (and a per-1M `price` on model rows). */
export function usageRows(
	db: Db,
	groupBy: UsageGroupBy,
	from: number,
	to: number,
	channel?: string,
	prices?: Prices | null,
	ownerId?: string,
) {
	const group = GROUPS[groupBy];
	const channelFilter = filterOf(channel, ownerId);

	const rows = db.$client
		.query<UsageRowBase, Record<string, string | number>>(
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
		.all({ from, to, ...bindsOf(channel, ownerId) });
	const spend = prices
		? spendByKey(db, groupBy, from, to, channel, prices, ownerId)
		: undefined;
	return rows.map((row) => {
		const price =
			groupBy === "model" ? prices?.get(String(row.key)) : undefined;
		return {
			...row,
			costUsd: spend ? (spend.get(row.key) ?? 0) : null,
			...(groupBy === "model"
				? {
						price: price
							? {
									inputPerMillion: price.input * 1_000_000,
									outputPerMillion: price.output * 1_000_000,
								}
							: null,
					}
				: {}),
		};
	});
}

/**
 * Token and call totals for each "since" time, read in a single pass over the
 * newest part of `llm_calls` (the windows overlap, so separate queries would
 * scan the same rows several times).
 */
export function usageSinceEach(
	db: Db,
	sinces: number[],
	ownerId?: string,
): UsageTotals[] {
	if (sinces.length === 0) return [];
	const columns = sinces
		.map((_, i) => usageColumnsWhere(`w${i}`, `at >= $since${i}`))
		.join(",");
	const binds = Object.fromEntries(
		sinces.map((since, i) => [`since${i}`, since]),
	);
	const row = db.$client
		.query<Record<string, number>, Record<string, number | string>>(
			`SELECT ${columns} FROM llm_calls WHERE at >= $oldest ${ownerId ? "AND channel_id IN (SELECT id FROM channels WHERE owner_id = $ownerId)" : ""}`,
		)
		.get({
			...binds,
			oldest: Math.min(...sinces),
			...(ownerId ? { ownerId } : {}),
		});

	return sinces.map((_, i) => ({
		inputTokens: row?.[`w${i}InputTokens`] ?? 0,
		outputTokens: row?.[`w${i}OutputTokens`] ?? 0,
		calls: row?.[`w${i}Calls`] ?? 0,
		callsWithoutUsage: row?.[`w${i}CallsWithoutUsage`] ?? 0,
	}));
}
