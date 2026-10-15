import { formatOutput } from "@bunli/core";

/** 🟢 from 80% right, 🟡 from 50%, 🔴 below. */
export function accuracyMark(accuracy: number): string {
	if (accuracy >= 0.8) return "🟢";
	if (accuracy >= 0.5) return "🟡";
	return "🔴";
}

/**
 * Metrics down, one column per run: a terminal-wide table of a dozen metrics
 * wraps, a column per run stays within 5 columns.
 *
 * bunli pads cells by string length, so marks are only emoji two code units
 * long (as wide as they look) — `✅` would shift a column.
 */
export function metricTable(
	runs: string[],
	metrics: [name: string, values: string[]][],
): string {
	return formatOutput(
		metrics.map(([name, values]) =>
			Object.fromEntries([
				["Metric", name],
				...runs.map((run, i) => [run, values[i] ?? ""]),
			]),
		),
		"md",
	);
}

/** A share as a whole percent, e.g. `0.664` → `66%`. */
export const pct = (value: number) => `${(value * 100).toFixed(0)}%`;
