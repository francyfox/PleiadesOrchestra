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

/**
 * Progress on one stderr line, rewritten in place in a terminal. Not bunli's
 * spinner: it takes over the whole screen (OpenTUI), which wiped the results
 * table and cut emoji to one cell.
 */
export function progressLine() {
	const tty = process.stderr.isTTY;
	const started = performance.now();
	const elapsed = () => `${((performance.now() - started) / 1000).toFixed(0)}s`;
	return {
		update(text: string) {
			if (tty) process.stderr.write(`\r\x1b[K${text} (${elapsed()})`);
		},
		done(text: string) {
			process.stderr.write(`${tty ? "\r\x1b[K" : ""}${text} (${elapsed()})\n`);
		},
	};
}
