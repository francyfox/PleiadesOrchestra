import { colors } from "@bunli/utils";
import type { DecisionAnswer } from "@repo/core";
import { accuracyMark, metricTable, pct } from "../report/report.view.ts";
import type { LayaResult, LayaSummary } from "./choices.types.ts";

const share = (t: { right: number; total: number } | undefined) =>
	t ? `${pct(t.right / t.total)} (${t.right}/${t.total})` : "—";

/** How sure Laya was of what it answered: P(choice) or P(true). */
function confidence(answer: DecisionAnswer | undefined): string {
	if (answer?.type === "boolean") return `p=${answer.probability.toFixed(2)}`;
	if (answer?.type === "choice") {
		const p = answer.probabilities?.[answer.choice];
		return p === undefined
			? answer.choice
			: `p=${p.toFixed(2)} ${answer.choice}`;
	}
	return "";
}

export function renderLayaCase(
	testCase: { id: string; domain: string; request: string },
	result: LayaResult,
): string {
	const ok = result.fields.every((f) => f.ok);
	const lines = [
		`${ok ? "🟢" : "🔴"} ${colors.bold(testCase.id)} ${colors.dim(`${testCase.domain} · ${result.latencyMs.toFixed(0)} ms`)}`,
		`   ${testCase.request}`,
	];
	if (result.error) lines.push(`   ${colors.red(`💥 ${result.error}`)}`);
	const width = Math.max(...result.fields.map((f) => f.name.length), 0);
	for (const field of result.fields) {
		const value =
			field.actual === undefined
				? colors.dim("—")
				: JSON.stringify(field.actual);
		const why = field.ok
			? ""
			: colors.red(`  ${field.miss}, want ${JSON.stringify(field.expected)}`);
		lines.push(
			`   ${field.ok ? "✅" : "❌"} ${field.name.padEnd(width)}  ${colors.dim(field.category.padEnd(7))} ${value}  ${colors.dim(confidence(result.answers[field.name]))}${why}`,
		);
	}
	return lines.join("\n");
}

export function renderLayaTable(run: string, summary: LayaSummary): string {
	const table = metricTable(
		[run],
		[
			["Requests", [String(summary.requests)]],
			[
				"All right",
				[`${accuracyMark(summary.allRight)} ${pct(summary.allRight)}`],
			],
			["Decisions", [share(summary.decisions)]],
			["enum", [share(summary.byKind.enum)]],
			["boolean", [share(summary.byKind.boolean)]],
			["given", [share(summary.byCategory.given)]],
			["unsaid", [share(summary.byCategory.unsaid)]],
			["refused", [share(summary.byCategory.refused)]],
			["p50 ms", [summary.p50Ms.toFixed(0)]],
			["p90 ms", [summary.p90Ms.toFixed(0)]],
		],
	);
	return `\n${colors.bold("🧠 Laya choices")}\n\n${table}`;
}
