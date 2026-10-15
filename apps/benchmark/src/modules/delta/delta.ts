import { createFunctionCallModel, fillOnce } from "@repo/core";
import { DELTA_MODEL } from "./delta.model.ts";
import {
	choiceMessages,
	choiceSchema,
	fieldMessages,
	fieldSchema,
	fieldsToFill,
	optionalFields,
} from "./delta.service.ts";
import type { Case, Endpoint, Filled } from "./delta.types.ts";

/** The JSON object in a completion's text; `undefined` when there is none. */
export function parseAnswer(text: string): unknown {
	if (!text) return undefined;
	try {
		return JSON.parse(text);
	} catch {
		return undefined;
	}
}

/**
 * Answer budgets. Qwen3 sometimes "thinks" inside a JSON string even with
 * thinking off (`</think># Final Answer…` in a list item): the run ends at
 * the old 512-token cap seconds later, unparseable. A field list of names is
 * ~20 tokens, one field's value (a list of 8 short items included) well
 * under 100; past that the answer is lost anyway, so stop early.
 */
export const CHOICE_MAX_TOKENS = 48;
export const FIELD_MAX_TOKENS = 128;

const REQUEST_TIMEOUT_MS = 120_000;

/**
 * delta's side of the benchmark: the model `@repo/core` builds for
 * `delta-function-call` (`createFunctionCallModel`) pointed at `endpoint`, and
 * one constrained completion per field (`fillOnce`, as production).
 */
export function createDelta(deps: {
	endpoint: Endpoint;
	fetch?: typeof fetch;
}) {
	const { endpoint } = deps;
	const model = createFunctionCallModel({
		baseURL: `${endpoint.baseUrl}/v1`,
		apiKey: endpoint.apiKey,
		model: endpoint.model ?? DELTA_MODEL.id,
		fetch: deps.fetch,
	});
	// Ollama (a named model) ignores chat_template_kwargs: without this Qwen3
	// thinks ~1000 tokens and the schema leaves an empty object.
	const providerOptions = endpoint.model
		? { reasoningEffort: "none" }
		: undefined;

	const fill = (
		messages: Parameters<typeof fillOnce>[0]["messages"],
		schema: Record<string, unknown>,
		maxOutputTokens: number,
	) =>
		fillOnce({
			model,
			messages,
			schema,
			maxOutputTokens,
			providerOptions,
			abortSignal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
		});
	type Called = Awaited<ReturnType<typeof fill>>;

	/**
	 * The arguments field by field (delta.service.ts): which optional fields,
	 * then one call per field. `prefilled` came from elsewhere (Laya) and is
	 * neither asked for nor filled again; `skip` are fields that other step
	 * decided to leave out.
	 */
	async function fillByField(
		testCase: Case,
		options: { prefilled?: Record<string, unknown>; skip?: string[] } = {},
	): Promise<Filled> {
		const prefilled = options.prefilled ?? {};
		const skip = [...Object.keys(prefilled), ...(options.skip ?? [])];
		const calls: Called[] = [];
		let chosen: string[] = [];
		const optional = optionalFields(testCase.tool, skip);
		if (optional.length > 0) {
			const call = await fill(
				choiceMessages(testCase, skip),
				choiceSchema(optional),
				CHOICE_MAX_TOKENS,
			);
			calls.push(call);
			const answer = parseAnswer(call.text) as { fill?: unknown } | undefined;
			chosen = Array.isArray(answer?.fill) ? answer.fill.map(String) : [];
		}
		const args: Record<string, unknown> = { ...prefilled };
		for (const name of fieldsToFill(testCase.tool, chosen, skip)) {
			const call = await fill(
				fieldMessages(testCase, name, args),
				fieldSchema(testCase.tool, name),
				FIELD_MAX_TOKENS,
			);
			calls.push(call);
			const answer = parseAnswer(call.text) as
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
			promptTokens: sum((call) => call.usage.inputTokens),
			outputTokens: sum((call) => call.usage.outputTokens),
			calls: calls.length,
		};
	}

	/** One fill before measuring (shader compile, caches); its answer is thrown away. */
	async function warmUp(testCase: Case | undefined): Promise<void> {
		if (testCase) await fillByField(testCase).catch(() => {});
	}

	return { fillByField, warmUp };
}
