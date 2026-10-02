import type { Case, Lang } from "./cases.ts";
import type { Candidate } from "./models.ts";
import {
	buildMessages,
	nativeTools,
	type PromptVersion,
	schemaFormat,
} from "./prompt.ts";
import { groundArguments } from "./sanitize.ts";
import {
	argsMatch,
	ingredientsMatch,
	type Run,
	type Summary,
	summarize,
} from "./score.ts";

/** `schema`: decoding constrained to the tool's JSON schema. `native`: the model's own tool-call format. */
export type Mode = "schema" | "native";

/** Values the shop treats as default, so giving or omitting them is the same answer. */
const DEFAULTS = { quantity: 1 };

export interface CaseResult extends Run {
	id: string;
	lang: Lang;
	actual: unknown;
	reason?: string;
	promptTokens?: number;
	outputTokens?: number;
}

interface Completion {
	choices?: {
		message?: {
			content?: string | null;
			tool_calls?: { function?: { name?: string; arguments?: unknown } }[];
		};
	}[];
	usage?: { prompt_tokens?: number; completion_tokens?: number };
}

function parseJson(text: string | null | undefined): unknown {
	if (!text) return undefined;
	try {
		return JSON.parse(text);
	} catch {
		return undefined;
	}
}

/** The arguments object out of a completion, in either mode; `undefined` when there is none. */
export function extractArguments(
	completion: Completion,
	mode: Mode,
	toolName: string,
): unknown {
	const message = completion.choices?.[0]?.message;
	if (mode === "schema") return parseJson(message?.content);
	const call = message?.tool_calls?.[0]?.function;
	if (!call || call.name !== toolName) return undefined;
	return typeof call.arguments === "string"
		? parseJson(call.arguments)
		: call.arguments;
}

async function complete(
	baseUrl: string,
	candidate: Candidate,
	testCase: Case,
	mode: Mode,
	prompt: PromptVersion,
): Promise<{ completion: Completion; latencyMs: number }> {
	const body: Record<string, unknown> = {
		messages: buildMessages(testCase, testCase.lang, prompt),
		max_tokens: 512,
		temperature: 0,
		...(candidate.qwen
			? { chat_template_kwargs: { enable_thinking: false } }
			: {}),
		...(mode === "schema"
			? { response_format: schemaFormat(testCase.tool) }
			: { tools: nativeTools(testCase.tool) }),
	};
	const started = performance.now();
	const response = await fetch(`${baseUrl}/v1/chat/completions`, {
		method: "POST",
		headers: { "content-type": "application/json" },
		body: JSON.stringify(body),
		signal: AbortSignal.timeout(120_000),
	});
	if (!response.ok) {
		throw new Error(
			`${response.status} ${(await response.text()).slice(0, 200)}`,
		);
	}
	const completion = (await response.json()) as Completion;
	return { completion, latencyMs: performance.now() - started };
}

/** Runs every case once against a running server. One warm-up call first (shader compile, caches). */
export async function runCases(
	baseUrl: string,
	candidate: Candidate,
	cases: Case[],
	mode: Mode,
	options: { prompt: PromptVersion; sanitize: boolean } = {
		prompt: "v1",
		sanitize: false,
	},
): Promise<CaseResult[]> {
	const [first] = cases;
	if (first)
		await complete(baseUrl, candidate, first, mode, options.prompt).catch(
			() => {},
		);

	const results: CaseResult[] = [];
	for (const testCase of cases) {
		try {
			const { completion, latencyMs } = await complete(
				baseUrl,
				candidate,
				testCase,
				mode,
				options.prompt,
			);
			const raw = extractArguments(completion, mode, testCase.tool.name);
			const actual =
				options.sanitize &&
				raw !== null &&
				typeof raw === "object" &&
				!Array.isArray(raw)
					? groundArguments(
							testCase.tool,
							raw as Record<string, unknown>,
							testCase.request[testCase.lang],
						)
					: raw;
			const verdict = testCase.check
				? ingredientsMatch(actual, testCase.check)
				: argsMatch(actual, testCase.expected, DEFAULTS);
			results.push({
				id: testCase.id,
				lang: testCase.lang,
				ok: verdict.ok,
				valid: actual !== undefined,
				latencyMs,
				actual,
				reason: verdict.reason,
				promptTokens: completion.usage?.prompt_tokens,
				outputTokens: completion.usage?.completion_tokens,
			});
		} catch (error) {
			results.push({
				id: testCase.id,
				lang: testCase.lang,
				ok: false,
				valid: false,
				latencyMs: 0,
				actual: undefined,
				reason: error instanceof Error ? error.message : String(error),
			});
		}
	}
	return results;
}

export interface Row {
	model: string;
	mode: Mode;
	lang: Lang;
	summary: Summary;
	meanPromptTokens: number;
	meanOutputTokens: number;
}

const mean = (values: (number | undefined)[]) => {
	const known = values.filter((v): v is number => v !== undefined);
	return known.length ? known.reduce((a, b) => a + b, 0) / known.length : 0;
};

/** One row per (model, mode, language). */
export function rowsFor(
	model: string,
	mode: Mode,
	results: CaseResult[],
	langs: readonly Lang[],
): Row[] {
	return langs.map((lang) => {
		const mine = results.filter((result) => result.lang === lang);
		return {
			model,
			mode,
			lang,
			summary: summarize(mine),
			meanPromptTokens: mean(mine.map((r) => r.promptTokens)),
			meanOutputTokens: mean(mine.map((r) => r.outputTokens)),
		};
	});
}
