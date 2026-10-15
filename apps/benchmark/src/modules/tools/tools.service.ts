import type { createDelta } from "../delta/delta.ts";
import { layaArguments, layaQuestions } from "../laya/laya.service.ts";
import type { LoadedLaya } from "../laya/laya.types.ts";
import { summarizeRuns } from "../stats/stats.service.ts";
import type {
	ComplexCase,
	ComplexResult,
	ComplexSummary,
	FieldCheck,
	FieldResult,
	Judged,
	Verdict,
} from "./tools.types.ts";

const isObject = (value: unknown): value is Record<string, unknown> =>
	typeof value === "object" && value !== null && !Array.isArray(value);

const norm = (value: unknown) =>
	typeof value === "string" ? value.trim().toLowerCase() : value;

const wordsOf = (text: string) =>
	text
		.toLowerCase()
		.split(/[^a-z0-9]+/)
		.filter(Boolean);

function want(check: FieldCheck): string {
	switch (check.kind) {
		case "query":
			return check.words.map((group) => group.join("/")).join(" + ");
		case "keywords":
			return check.mustInclude.map((group) => group.join("/")).join(", ");
		default:
			return JSON.stringify(check.value);
	}
}

/** Whether one argument is right for its check. */
export function judgeField(
	check: FieldCheck,
	value: unknown,
	request: string,
): Verdict {
	if (value === undefined)
		return { ok: false, reason: `missing, want ${want(check)}` };
	switch (check.kind) {
		case "query": {
			if (typeof value !== "string") return { ok: false, reason: "not text" };
			const text = value.toLowerCase();
			const missed = check.words.find(
				(group) => !group.some((word) => text.includes(word.toLowerCase())),
			);
			if (missed) return { ok: false, reason: `missing ${missed.join("/")}` };
			const count = wordsOf(value).length;
			if (count > check.maxWords)
				return {
					ok: false,
					reason: `${count} words, more than ${check.maxWords}`,
				};
			return { ok: true };
		}
		case "keywords": {
			if (!Array.isArray(value)) return { ok: false, reason: "not a list" };
			const items = value.map((item) => String(item).toLowerCase());
			if (items.length > check.maxItems)
				return {
					ok: false,
					reason: `${items.length} items, more than ${check.maxItems}`,
				};
			const asked = new Set(wordsOf(request));
			if (
				items.length > 0 &&
				items.every((item) => wordsOf(item).every((word) => asked.has(word)))
			)
				return { ok: false, reason: "only words from the request" };
			const missed = check.mustInclude.find(
				(group) =>
					!items.some((item) =>
						group.some((word) => item.includes(word.toLowerCase())),
					),
			);
			if (missed) return { ok: false, reason: `missing ${missed.join("/")}` };
			return { ok: true };
		}
		default:
			return norm(value) === norm(check.value) &&
				typeof value === typeof check.value
				? { ok: true }
				: {
						ok: false,
						reason: `${JSON.stringify(value)} ≠ ${JSON.stringify(check.value)}`,
					};
	}
}

export function judgeCase(testCase: ComplexCase, actual: unknown): Judged {
	const args = isObject(actual) ? actual : {};
	const fields = Object.entries(testCase.fields).map(
		([name, check]): FieldResult => {
			const verdict = isObject(actual)
				? judgeField(check, args[name], testCase.request)
				: { ok: false, reason: "not an object" };
			return { name, kind: check.kind, value: args[name], ...verdict };
		},
	);
	const known = new Set([
		...Object.keys(testCase.fields),
		...(testCase.free ?? []),
	]);
	const extra = Object.keys(args).filter((key) => !known.has(key));
	return {
		fields,
		extra,
		ok: isObject(actual) && extra.length === 0 && fields.every((f) => f.ok),
	};
}

const mean = (values: (number | undefined)[]) => {
	const known = values.filter((v): v is number => v !== undefined);
	return known.length ? known.reduce((a, b) => a + b, 0) / known.length : 0;
};

export function summarizeComplex(results: ComplexResult[]): ComplexSummary {
	const { cases, valid, p50Ms, p90Ms, meanMs, accuracy } =
		summarizeRuns(results);
	const byKind: ComplexSummary["byKind"] = {};
	for (const field of results.flatMap((r) => r.fields)) {
		const tally = byKind[field.kind] ?? { right: 0, total: 0 };
		tally.total++;
		if (field.ok) tally.right++;
		byKind[field.kind] = tally;
	}
	return {
		cases,
		valid,
		p50Ms,
		p90Ms,
		meanMs,
		allFields: accuracy,
		byKind,
		meanPromptTokens: mean(results.map((r) => r.promptTokens)),
		meanOutputTokens: mean(results.map((r) => r.outputTokens)),
		meanDeltaCalls: mean(results.map((r) => r.deltaCalls)),
		meanLayaMs: results.some((r) => r.layaMs !== undefined)
			? mean(results.map((r) => r.layaMs))
			: undefined,
	};
}

/**
 * Every complex case once, field by field (delta.service.ts). With `laya`, the
 * enums and booleans are Laya's (one pass for all of them) and delta fills
 * the rest; the case's time is both together. One warm-up fill first.
 */
export async function runComplex(
	delta: Pick<ReturnType<typeof createDelta>, "fillByField" | "warmUp">,
	cases: ComplexCase[],
	options: {
		laya?: LoadedLaya;
		onCase?: (at: number, total: number, id: string) => void;
	} = {},
): Promise<ComplexResult[]> {
	const asCase = (testCase: ComplexCase) => ({
		tool: testCase.tool,
		facts: {},
		request: testCase.request,
	});
	const [first] = cases;
	await delta.warmUp(first && asCase(first));
	if (first && options.laya)
		await options.laya.ask(first.request, layaQuestions(first.tool));

	const results: ComplexResult[] = [];
	for (const testCase of cases) {
		options.onCase?.(results.length + 1, cases.length, testCase.id);
		try {
			let layaMs: number | undefined;
			let decided: ReturnType<typeof layaArguments> = { args: {}, skip: [] };
			if (options.laya) {
				const asked = await options.laya.ask(
					testCase.request,
					layaQuestions(testCase.tool),
				);
				layaMs = asked.latencyMs;
				decided = layaArguments(testCase.tool, asked.answers);
			}
			const filled = await delta.fillByField(asCase(testCase), {
				prefilled: decided.args,
				skip: decided.skip,
			});
			results.push({
				id: testCase.id,
				valid: true,
				latencyMs: filled.latencyMs + (layaMs ?? 0),
				layaMs,
				promptTokens: filled.promptTokens,
				outputTokens: filled.outputTokens,
				deltaCalls: filled.calls,
				actual: filled.args,
				...judgeCase(testCase, filled.args),
			});
		} catch (error) {
			results.push({
				id: testCase.id,
				valid: false,
				latencyMs: 0,
				deltaCalls: 0,
				actual: undefined,
				error: error instanceof Error ? error.message : String(error),
				...judgeCase(testCase, undefined),
			});
		}
	}
	return results;
}
