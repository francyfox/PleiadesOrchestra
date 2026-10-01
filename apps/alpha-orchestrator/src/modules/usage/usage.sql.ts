/** Aggregate columns over `llm_calls` — SUM skips NULLs, so calls without usage don't count as 0. */
export const USAGE_COLUMNS = `
	COALESCE(SUM(input_tokens), 0) AS inputTokens,
	COALESCE(SUM(output_tokens), 0) AS outputTokens,
	COUNT(*) AS calls,
	COALESCE(SUM(CASE WHEN input_tokens IS NULL OR output_tokens IS NULL THEN 1 ELSE 0 END), 0) AS callsWithoutUsage`;

/** `YYYY-MM-DD` (UTC) of a millisecond timestamp column. */
export function dayOf(column: string): string {
	return `strftime('%Y-%m-%d', ${column} / 1000, 'unixepoch')`;
}

/**
 * Same totals as `USAGE_COLUMNS`, but only over calls matching `condition`.
 * Column names are prefixed (`<prefix>InputTokens`, …) so several windows can
 * be read in one pass over the table.
 */
export function usageColumnsWhere(prefix: string, condition: string): string {
	const only = `FILTER (WHERE ${condition})`;
	return `
	COALESCE(SUM(input_tokens) ${only}, 0) AS ${prefix}InputTokens,
	COALESCE(SUM(output_tokens) ${only}, 0) AS ${prefix}OutputTokens,
	COUNT(*) ${only} AS ${prefix}Calls,
	COALESCE(SUM(CASE WHEN input_tokens IS NULL OR output_tokens IS NULL THEN 1 ELSE 0 END) ${only}, 0) AS ${prefix}CallsWithoutUsage`;
}
