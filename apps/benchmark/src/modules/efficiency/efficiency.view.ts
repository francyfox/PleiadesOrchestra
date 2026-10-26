import { pct } from "../report/report.view.ts";
import type { CaseRun, ContenderSummary, Price } from "./efficiency.types.ts";

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

const mean = (values: number[]) =>
	values.reduce((sum, value) => sum + value, 0) / (values.length || 1);

/**
 * The whole result as plain text (no colours, no emoji): the setup, the
 * averages per metric, then one row per case and contender (over all iterations).
 */
export function renderReport(input: {
	at: string;
	seed: number;
	price: Price;
	/** Models and temperatures per contender, one line each. */
	setup: string[];
	summaries: ContenderSummary[];
}): string {
	const { summaries } = input;
	const iterations = summaries[0]?.iterations ?? 0;
	const perIteration = (total: number, s: ContenderSummary) =>
		total / (s.done || 1);
	const partial = summaries.some((s) => s.done < s.iterations);
	const metrics: [string, (s: ContenderSummary) => string][] = [
		["case runs", (s) => String(s.cases)],
		["errors", (s) => String(s.errors)],
		["success", (s) => pct(s.success)],
		["latency p50", (s) => seconds(s.p50Ms)],
		["latency mean", (s) => seconds(s.meanMs)],
		["steps / case", (s) => s.meanSteps.toFixed(1)],
		["  model calls", (s) => s.meanModelCalls.toFixed(1)],
		["  tool calls", (s) => s.meanToolCalls.toFixed(1)],
		[
			"input tokens / iteration",
			(s) => perIteration(s.inputTokens, s).toFixed(0),
		],
		[
			"output tokens / iteration",
			(s) => perIteration(s.outputTokens, s).toFixed(0),
		],
		["cost / iteration", (s) => usd(perIteration(s.costUsd, s))],
		[
			"cost / success",
			(s) =>
				s.success ? usd(s.costUsd / (s.success * (s.cases - s.errors))) : "-",
		],
	];

	const lines = [
		"Pleiades efficiency benchmark",
		...(partial
			? [
					"PARTIAL REPORT: the run is not finished (interrupted, stopped or still going); averages cover what is done",
				]
			: []),
		...summaries.map(
			(s) => `${s.name}: ${Math.floor(s.done)}/${s.iterations} iterations`,
		),
		`at ${input.at}, shop seed ${input.seed}, ${iterations} iterations of every case (averages below), cost: each call at its model's OpenRouter price, a model without one at $${input.price.input} in / $${input.price.output} out per 1M tokens`,
		"",
		"setup",
		...input.setup.map((line) => `  ${line}`),
		"",
		table([
			["metric", ...summaries.map((s) => s.name)],
			...metrics.map(([name, value]) => [
				name,
				...summaries.map((s) => (s.cases ? value(s) : "-")),
			]),
		]),
		"",
		...summaries.map((s) => `tokens of ${s.name}: ${s.tokensNote}`),
	];

	for (const s of summaries) {
		if (!s.runs.length) continue;
		const ids = [...new Set(s.runs.map((run) => run.id))];
		lines.push("", `== ${s.name}`);
		lines.push(
			table([
				[
					"case",
					"ok",
					"errors",
					"time",
					"model",
					"tools",
					"tokens",
					"reply / error",
				],
				...ids.map((id) => {
					const all = s.runs.filter((run) => run.id === id);
					const runs = all.filter((run) => run.status !== "error");
					// The last failure explains a miss; with none, the last run shows what a pass looks like.
					const shown =
						all.findLast((run) => !run.ok) ?? (all.at(-1) as CaseRun);
					return [
						id,
						`${runs.filter((run) => run.ok).length}/${runs.length}`,
						String(all.length - runs.length),
						seconds(mean(runs.map((run) => run.latencyMs))),
						mean(runs.map((run) => run.modelCalls)).toFixed(1),
						mean(runs.map((run) => run.toolCalls)).toFixed(1),
						mean(runs.map((run) => run.inputTokens + run.outputTokens)).toFixed(
							0,
						),
						(shown.error ?? shown.reply).replace(/\s+/g, " ").slice(0, 100),
					];
				}),
			]),
		);
	}
	return `${lines.join("\n")}\n`;
}
