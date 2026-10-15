import type { ToolSpec } from "../delta/delta.types.ts";
import { summarizeRuns } from "../stats/stats.service.ts";
import type {
	Category,
	Expected,
	FieldVerdict,
	Kind,
	LayaResult,
	LayaSummary,
	Tally,
} from "./choices.types.ts";

const same = (a: unknown, b: unknown) =>
	typeof a === "string" && typeof b === "string"
		? a.toLowerCase() === b.toLowerCase()
		: a === b;

const categoryOf = (expected: Expected): Category =>
	expected === null ? "unsaid" : expected === false ? "refused" : "given";

/** Each expected field against the arguments Laya's answers became. */
export function judgeChoices(
	tool: ToolSpec,
	expected: Record<string, Expected>,
	actual: Record<string, unknown>,
): FieldVerdict[] {
	return Object.entries(expected).map(([name, want]) => {
		const got = actual[name];
		const category = categoryOf(want);
		const field = tool.inputSchema.properties?.[name] as
			| { type?: string }
			| undefined;
		const kind: Kind = field?.type === "boolean" ? "boolean" : "enum";
		const base = { name, kind, category, expected: want, actual: got };
		if (category === "given") {
			if (got === undefined) return { ...base, ok: false, miss: "left out" };
			return same(got, want)
				? { ...base, ok: true }
				: { ...base, ok: false, miss: "wrong" };
		}
		const out = got === undefined || (category === "refused" && got === false);
		return out
			? { ...base, ok: true }
			: { ...base, ok: false, miss: "invented" };
	});
}

function tally<K extends string>(
	fields: FieldVerdict[],
	key: (field: FieldVerdict) => K,
): Partial<Record<K, Tally>> {
	const out: Partial<Record<K, Tally>> = {};
	for (const field of fields) {
		const t = out[key(field)] ?? { right: 0, total: 0 };
		t.total++;
		if (field.ok) t.right++;
		out[key(field)] = t;
	}
	return out;
}

export function summarizeLaya(results: LayaResult[]): LayaSummary {
	const fields = results.flatMap((r) => r.fields);
	const { cases, accuracy, p50Ms, p90Ms, meanMs } = summarizeRuns(
		results.map((r) => ({
			ok: r.fields.every((f) => f.ok),
			valid: r.error === undefined,
			latencyMs: r.latencyMs,
		})),
	);
	return {
		requests: cases,
		decisions: {
			right: fields.filter((f) => f.ok).length,
			total: fields.length,
		},
		allRight: accuracy,
		byKind: tally(fields, (f) => f.kind),
		byCategory: tally(fields, (f) => f.category),
		p50Ms,
		p90Ms,
		meanMs,
	};
}
