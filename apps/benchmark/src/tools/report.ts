import { formatOutput } from "@bunli/core";
import { colors } from "@bunli/utils";
import type { CaseResult, Mode, Row } from "./run.ts";

export interface Failure {
	model: string;
	mode: Mode;
	result: CaseResult;
}

/** 🟢 from 80% right, 🟡 from 50%, 🔴 below. */
export function accuracyMark(accuracy: number): string {
	if (accuracy >= 0.8) return "🟢";
	if (accuracy >= 0.5) return "🟡";
	return "🔴";
}

const pct = (value: number) => `${(value * 100).toFixed(0)}%`;
const ms = (value: number) => value.toFixed(0);

/**
 * One line per (model, mode). bunli pads cells by string length, so marks are
 * only emoji two code units long (as wide as they look) — `✅` would shift a column.
 */
export function renderTable(rows: Row[]): string {
	const table = formatOutput(
		rows.map((row) => ({
			Model: row.model,
			Mode: row.mode,
			Cases: String(row.summary.cases),
			Correct: `${accuracyMark(row.summary.accuracy)} ${pct(row.summary.accuracy)}`,
			"Valid JSON": pct(row.summary.valid),
			"p50 ms": ms(row.summary.p50Ms),
			"p90 ms": ms(row.summary.p90Ms),
			"Prompt tok": ms(row.meanPromptTokens),
			"Out tok": ms(row.meanOutputTokens),
		})),
		"md",
	);
	return `\n${colors.bold("📊 Results")}\n\n${table}`;
}

export function renderFailures(failures: Failure[]): string {
	if (failures.length === 0) return `\n${colors.green("✅ No misses")}`;
	const lines = failures.map(
		({ model, mode, result }) =>
			`${colors.red(`❌ ${result.id}`)} ${colors.dim(`${model} ${mode}`)}\n` +
			`   ${result.reason ?? ""}\n` +
			`   ${colors.dim(`got ${JSON.stringify(result.actual)}`)}`,
	);
	return `\n${colors.bold(`🔍 Misses (${failures.length})`)}\n\n${lines.join("\n")}`;
}
