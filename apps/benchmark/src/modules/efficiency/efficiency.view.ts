import { pct } from "../report/report.view.ts";
import type { ContenderSummary, Price } from "./efficiency.types.ts";

const seconds = (ms: number) => `${(ms / 1000).toFixed(2)} s`;
const usd = (value: number) => `$${value.toFixed(6)}`;

/** Fixed-width columns, padded with spaces: readable in any viewer, easy to diff. */
function table(rows: string[][]): string {
	const widths = rows[0]?.map((_, i) =>
		Math.max(...rows.map((row) => (row[i] ?? "").length)),
	);
	return rows
		.map((row) =>
			row
				.map((cell, i) => cell.padEnd(widths?.[i] ?? 0))
				.join("  ")
				.trimEnd(),
		)
		.join("\n");
}

/**
 * The whole result as plain text (no colours, no emoji): the comparison per
 * metric, then every case per contender with its reply cut short.
 */
export function renderReport(input: {
	at: string;
	seed: number;
	price: Price;
	summaries: ContenderSummary[];
}): string {
	const { summaries } = input;
	const metrics: [string, (s: ContenderSummary) => string][] = [
		["cases", (s) => String(s.cases)],
		["success", (s) => pct(s.success)],
		["latency p50", (s) => seconds(s.p50Ms)],
		["latency mean", (s) => seconds(s.meanMs)],
		["steps / case", (s) => s.meanSteps.toFixed(1)],
		["  model calls", (s) => s.meanModelCalls.toFixed(1)],
		["  tool calls", (s) => s.meanToolCalls.toFixed(1)],
		["input tokens", (s) => String(s.inputTokens)],
		["output tokens", (s) => String(s.outputTokens)],
		["cost (all cases)", (s) => usd(s.costUsd)],
		[
			"cost / success",
			(s) => (s.success ? usd(s.costUsd / (s.success * s.cases)) : "-"),
		],
	];

	const lines = [
		"Pleiades efficiency benchmark",
		`at ${input.at}, shop seed ${input.seed}, cost: each call at its model's OpenRouter price, a model without one at $${input.price.input} in / $${input.price.output} out per 1M tokens`,
		"",
		table([
			["metric", ...summaries.map((s) => s.name)],
			...metrics.map(([name, value]) => [name, ...summaries.map(value)]),
		]),
		"",
		...summaries.map((s) => `tokens of ${s.name}: ${s.tokensNote}`),
	];

	for (const s of summaries) {
		lines.push("", `== ${s.name}`);
		lines.push(
			table([
				["case", "ok", "time", "model", "tools", "tokens", "reply / error"],
				...s.runs.map((run) => [
					run.id,
					run.ok ? "yes" : "no",
					seconds(run.latencyMs),
					String(run.modelCalls),
					String(run.toolCalls),
					String(run.inputTokens + run.outputTokens),
					(run.error ?? run.reply).replace(/\s+/g, " ").slice(0, 100),
				]),
			]),
		);
	}
	return `${lines.join("\n")}\n`;
}
