import { colors } from "@bunli/utils";
import { accuracyMark, metricTable, pct } from "../report/report.view.ts";
import type {
	ComplexCase,
	ComplexResult,
	ComplexSummary,
	FieldKind,
} from "./tools.types.ts";

/** bunli has no orange; 256-colour code 208, off whenever bunli's colours are (no TTY, NO_COLOR). */
const orange = (text: string) =>
	colors.red("") === "" ? text : `\x1b[38;5;208m${text}\x1b[39m`;

/** enum green, boolean orange (as asked); the rest so they stay apart. */
export const PAINT: Record<FieldKind, (text: string) => string> = {
	query: colors.cyan,
	keywords: colors.magenta,
	enum: colors.green,
	boolean: orange,
	number: colors.blue,
};

const KINDS = Object.keys(PAINT) as FieldKind[];

/** The request with each field's words painted by the field's kind. */
export function highlight(
	request: string,
	spans: { source: string; kind: FieldKind }[],
	paint: Record<FieldKind, (text: string) => string> = PAINT,
): string {
	const lower = request.toLowerCase();
	const found = spans
		.map((span) => ({
			...span,
			at: lower.indexOf(span.source.toLowerCase()),
		}))
		.filter((span) => span.at >= 0)
		.sort((a, b) => a.at - b.at);
	let out = "";
	let at = 0;
	for (const span of found) {
		if (span.at < at) continue;
		const end = span.at + span.source.length;
		out +=
			request.slice(at, span.at) +
			paint[span.kind](request.slice(span.at, end));
		at = end;
	}
	return out + request.slice(at);
}

export const legend = () =>
	KINDS.map((kind) => PAINT[kind](kind)).join(colors.dim(" · "));

/** One case: the painted request, then each field → what the model gave. */
export function renderComplexCase(
	testCase: ComplexCase,
	result: ComplexResult,
): string {
	const spans = Object.values(testCase.fields);
	const head =
		`${result.ok ? "🟢" : "🔴"} ${colors.bold(testCase.id)} ` +
		colors.dim(
			`${testCase.domain} · ${result.latencyMs.toFixed(0)} ms` +
				(result.layaMs === undefined
					? ""
					: ` (Laya ${result.layaMs.toFixed(0)})`) +
				` · ${result.deltaCalls} delta calls`,
		);
	const lines = [head, `   ${highlight(testCase.request, spans)}`];
	if (result.error) lines.push(`   ${colors.red(`💥 ${result.error}`)}`);
	const width = Math.max(...result.fields.map((f) => f.name.length), 0);
	for (const field of result.fields) {
		const value =
			field.value === undefined ? colors.dim("—") : JSON.stringify(field.value);
		const why = field.ok ? "" : colors.red(`  ${field.reason ?? ""}`);
		lines.push(
			`   ${field.ok ? "✅" : "❌"} ${PAINT[field.kind](field.name.padEnd(width))}  ` +
				`${colors.dim(field.kind.padEnd(8))} ${value}${why}`,
		);
	}
	if (result.extra.length > 0)
		lines.push(`   ${colors.yellow(`⚠️  extra: ${result.extra.join(", ")}`)}`);
	return lines.join("\n");
}

/** The complex check's own table: whole cases, each kind of field, speed; one column per model. */
export function renderComplexComparison(
	models: string[],
	summaries: (ComplexSummary | undefined)[],
): string {
	const column = (read: (summary: ComplexSummary) => string) =>
		summaries.map((summary) => (summary ? read(summary) : "💥"));
	const byKind = KINDS.map((kind): [string, string[]] => [
		kind,
		column((summary) => {
			const tally = summary.byKind[kind];
			return tally
				? `${pct(tally.right / tally.total)} (${tally.right}/${tally.total})`
				: "—";
		}),
	]);
	const table = metricTable(models, [
		["Cases", column((summary) => String(summary.cases))],
		[
			"All fields",
			column((s) => `${accuracyMark(s.allFields)} ${pct(s.allFields)}`),
		],
		...byKind,
		// Per field the answer is always an object: this is calls that didn't fail.
		["Completed", column((s) => pct(s.valid))],
		["p50 ms", column((s) => s.p50Ms.toFixed(0))],
		["p90 ms", column((s) => s.p90Ms.toFixed(0))],
		["Prompt tok", column((s) => s.meanPromptTokens.toFixed(0))],
		["Out tok", column((s) => s.meanOutputTokens.toFixed(0))],
		["delta calls", column((s) => s.meanDeltaCalls.toFixed(1))],
		...(summaries.some((s) => s?.meanLayaMs !== undefined)
			? [
					["Laya ms", column((s) => (s.meanLayaMs ?? 0).toFixed(0))] as [
						string,
						string[],
					],
				]
			: []),
	]);
	return `\n${colors.bold("🧩 Complex check")}\n\n${table}`;
}

export function renderComplexTable(
	model: string,
	summary: ComplexSummary,
): string {
	return renderComplexComparison([model], [summary]);
}
