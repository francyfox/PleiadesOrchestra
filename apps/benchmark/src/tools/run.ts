import type { ChatMessage } from "@repo/core";
import type { Case } from "./cases.ts";
import {
	choiceMessages,
	choiceSchema,
	fieldMessages,
	fieldSchema,
	fieldsToFill,
	optionalFields,
} from "./per-field.ts";
import { buildMessages, nativeTools, schemaFormat } from "./prompt.ts";
import { groundArguments } from "./sanitize.ts";
import {
	argsMatch,
	ingredientsMatch,
	type Run,
	type Summary,
	summarize,
} from "./score.ts";
import type { ToolSpec } from "./tools.ts";

/** `schema`: decoding constrained to the tool's JSON schema. `native`: the model's own tool-call format. */
export type Mode = "schema" | "native";

/** Values the shop treats as default, so giving or omitting them is the same answer. */
const DEFAULTS = { quantity: 1 };

export interface CaseResult extends Run {
	id: string;
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

interface Called {
	completion: Completion;
	latencyMs: number;
}

/** One chat completion; `extra` is the response format (or native tools). */
async function post(
	baseUrl: string,
	messages: ChatMessage[],
	extra: Record<string, unknown>,
): Promise<Called> {
	const body: Record<string, unknown> = {
		messages,
		max_tokens: 512,
		temperature: 0,
		// As delta in production: Qwen3 thinks unless told not to.
		chat_template_kwargs: { enable_thinking: false },
		...extra,
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

function complete(
	baseUrl: string,
	testCase: Case,
	mode: Mode,
	fields: boolean,
): Promise<Called> {
	return post(
		baseUrl,
		buildMessages(testCase, { fields }),
		mode === "schema"
			? { response_format: schemaFormat(testCase.tool) }
			: { tools: nativeTools(testCase.tool) },
	);
}

const asFormat = (schema: ToolSpec["inputSchema"]) => ({
	response_format: schemaFormat({
		name: "",
		description: "",
		inputSchema: schema,
	}),
});

/** `--per-field` (schema mode): which optional fields, then one call per field. */
async function completeByField(
	baseUrl: string,
	testCase: Case,
): Promise<{
	args: Record<string, unknown>;
	latencyMs: number;
	promptTokens: number;
	outputTokens: number;
}> {
	const calls: Called[] = [];
	const optional = optionalFields(testCase.tool);
	let chosen: string[] = [];
	if (optional.length > 0) {
		const call = await post(
			baseUrl,
			choiceMessages(testCase),
			asFormat(choiceSchema(optional)),
		);
		calls.push(call);
		const answer = extractArguments(call.completion, "schema", "") as
			| { fill?: unknown }
			| undefined;
		chosen = Array.isArray(answer?.fill) ? answer.fill.map(String) : [];
	}
	const args: Record<string, unknown> = {};
	for (const name of fieldsToFill(testCase.tool, chosen)) {
		const call = await post(
			baseUrl,
			fieldMessages(testCase, name, args),
			asFormat(fieldSchema(testCase.tool, name)),
		);
		calls.push(call);
		const answer = extractArguments(call.completion, "schema", "") as
			| Record<string, unknown>
			| undefined;
		// An unusable answer leaves the field out, as a failed fill would.
		if (answer && name in answer) args[name] = answer[name];
	}
	const sum = (pick: (call: Called) => number | undefined) =>
		calls.reduce((total, call) => total + (pick(call) ?? 0), 0);
	return {
		args,
		latencyMs: sum((call) => call.latencyMs),
		promptTokens: sum((call) => call.completion.usage?.prompt_tokens),
		outputTokens: sum((call) => call.completion.usage?.completion_tokens),
	};
}

/** Runs every case once against a running server. One warm-up call first (shader compile, caches). */
export async function runCases(
	baseUrl: string,
	cases: Case[],
	mode: Mode,
	options: {
		sanitize: boolean;
		fields?: boolean;
		perField?: boolean;
		/** Called before each case: its 1-based number, the total, its id. */
		onCase?: (at: number, total: number, id: string) => void;
	} = {
		sanitize: false,
	},
): Promise<CaseResult[]> {
	const [first] = cases;
	if (first)
		await complete(baseUrl, first, mode, options.fields ?? false).catch(
			() => {},
		);

	const results: CaseResult[] = [];
	for (const testCase of cases) {
		options.onCase?.(results.length + 1, cases.length, testCase.id);
		try {
			let raw: unknown;
			let latencyMs: number;
			let promptTokens: number | undefined;
			let outputTokens: number | undefined;
			if (options.perField) {
				const byField = await completeByField(baseUrl, testCase);
				({ latencyMs, promptTokens, outputTokens } = byField);
				raw = byField.args;
			} else {
				const called = await complete(
					baseUrl,
					testCase,
					mode,
					options.fields ?? false,
				);
				latencyMs = called.latencyMs;
				promptTokens = called.completion.usage?.prompt_tokens;
				outputTokens = called.completion.usage?.completion_tokens;
				raw = extractArguments(called.completion, mode, testCase.tool.name);
			}
			const actual =
				options.sanitize &&
				raw !== null &&
				typeof raw === "object" &&
				!Array.isArray(raw)
					? groundArguments(
							testCase.tool,
							raw as Record<string, unknown>,
							testCase.request,
						)
					: raw;
			const verdict = testCase.check
				? ingredientsMatch(actual, testCase.check)
				: argsMatch(actual, testCase.expected, DEFAULTS);
			results.push({
				id: testCase.id,
				ok: verdict.ok,
				valid: actual !== undefined,
				latencyMs,
				actual,
				reason: verdict.reason,
				promptTokens,
				outputTokens,
			});
		} catch (error) {
			results.push({
				id: testCase.id,
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
	summary: Summary;
	meanPromptTokens: number;
	meanOutputTokens: number;
}

const mean = (values: (number | undefined)[]) => {
	const known = values.filter((v): v is number => v !== undefined);
	return known.length ? known.reduce((a, b) => a + b, 0) / known.length : 0;
};

/** One row per (model, mode). */
export function rowsFor(
	model: string,
	mode: Mode,
	results: CaseResult[],
): Row[] {
	return [
		{
			model,
			mode,
			summary: summarize(results),
			meanPromptTokens: mean(results.map((r) => r.promptTokens)),
			meanOutputTokens: mean(results.map((r) => r.outputTokens)),
		},
	];
}
