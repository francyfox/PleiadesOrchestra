import { createOpenAICompatible } from "@ai-sdk/openai-compatible";
import {
	APICallError,
	generateText,
	type JSONValue,
	jsonSchema,
	type LanguageModel,
	NoObjectGeneratedError,
	Output,
} from "ai";
import { groundArguments } from "./ground-arguments";
import { recordCall } from "./record-call";
import { repairArguments } from "./repair-arguments";
import {
	type AttemptTally,
	attemptsOf,
	newTally,
	reportingTrouble,
	tallyingAttempts,
} from "./server-trouble";
import {
	type createTelemetry,
	telemetry as defaultTelemetry,
} from "./telemetry";
import type { CallContext, UsageRecorder } from "./types";
import { validateArguments } from "./validate-arguments";

export interface FunctionCallTool {
	name: string;
	description?: string;
	inputSchema: {
		type: "object";
		properties?: Record<string, unknown>;
		required?: string[];
	};
}

export interface FunctionCallRequest {
	tool: FunctionCallTool;
	/** Facts the plan already knows (`query`, `quantity`, the chosen store, …). */
	facts: Record<string, unknown>;
	/** What the previous tool answered, if the arguments depend on it (a product name from a search). */
	lastAnswer?: string;
	/** The user's message. */
	request: string;
	/** Links the call to a GOAP run in the usage ledger. */
	context?: CallContext;
}

/**
 * Port: writes the arguments of ONE tool call as JSON. Which tool to call and
 * in what order is not its business — the GOAP planner (with Laya for bounded
 * choices) decides that. Throws when the model's answer is unusable; callers
 * fall back to a mechanical argument builder.
 */
export interface FunctionCallAgent {
	fillArguments(request: FunctionCallRequest): Promise<Record<string, unknown>>;
}

export interface FunctionCallAgentConfig {
	/** OpenAI-compatible base URL of `delta-function-call`, ending in `/v1`. */
	baseURL: string;
	apiKey: string;
	model: string;
	maxOutputTokens?: number;
	/** Default 0: arguments must be reproducible. */
	temperature?: number;
	/** Extra request-body fields for every call, e.g. `{ reasoningEffort: "none" }` for Ollama (camelCase: it lands on the wire as `reasoning_effort`). */
	providerOptions?: Record<string, JSONValue>;
	/** Name written to the usage ledger. Default `delta`. */
	provider?: string;
	usageRecorder?: UsageRecorder;
	telemetry?: ReturnType<typeof createTelemetry>;
	fetchImpl?: typeof fetch;
}

/**
 * The rules of the job, picked with `apps/benchmark` (tools) (prompt v2: worked
 * examples per kind of call; with the schema-constrained decoding and
 * `groundArguments` below it filled 71% of the benchmark cases exactly).
 */
export const FUNCTION_CALL_SYSTEM_PROMPT = [
	"You fill in the arguments of ONE tool call for a website's assistant.",
	"Reply with a single JSON object that matches the tool's input schema, nothing else.",
	"",
	"Rules:",
	"- Use only what the request, the known facts and the last tool answer say. Never invent values.",
	"- Leave every optional field out unless the request clearly asks for it: no filter, no limit, no category unless the user said so.",
	"- A free-text search field holds just the thing looked for, in singular or plural as said; constraints (price, size, colour, dates, category) go in their own fields when the schema has them, never in the search text.",
	"- To pick an item from the last tool answer, copy ONE exact name from it or from the known facts: the first available one that fits the request. Pick several only if the request names several.",
	"- To change something already chosen, use the item from the known facts or the request.",
	"- A field with an `enum` takes one of its listed values only. Numbers are plain numbers without currency or units.",
	"- Where the schema asks for a list that the request does not give (steps, parts, ingredients), write the 6-10 plain names a typical case needs, without amounts.",
	"",
	"Examples (different sites):",
	'Request: two laptops, answer lists "- ThinkBook 14 — in stock" => {"items":[{"product":"ThinkBook 14","quantity":2}]}',
	'Request: find headphones under 50 dollars => {"query":"headphones","max_price":50}',
	'Request: black leather jacket in size M => {"query":"jacket","color":"black","size":"M"}',
	'Request: hotel in Rome from 3 to 5 May => {"city":"Rome","check_in":"2026-05-03","check_out":"2026-05-05"}',
	'Request: make it 5, fact product "USB cable" => {"product":"USB cable","quantity":5}',
].join("\n");

export interface ChatMessage {
	role: "system" | "user" | "assistant";
	content: string;
}

/**
 * The first two messages delta gets for a tool call: the rules, then tool,
 * known facts, last answer and request. Exported so `apps/benchmark` (tools)
 * measures exactly what production sends.
 */
export function functionCallMessages(
	request: FunctionCallRequest,
): ChatMessage[] {
	const user = [
		`Tool: ${request.tool.name}`,
		`What it does: ${request.tool.description ?? ""}`,
		`Known facts: ${JSON.stringify(request.facts)}`,
		"Last tool answer:",
		request.lastAnswer ?? "(none)",
		`Request: ${request.request}`,
	].join("\n");
	return [
		{ role: "system", content: FUNCTION_CALL_SYSTEM_PROMPT },
		{ role: "user", content: user },
	];
}

/** Provider name of the delta model; extra request-body fields live under this key of `providerOptions`. */
const PROVIDER_NAME = "delta";

/** The AI SDK model for `delta-function-call` (llama-server, OpenAI-compatible). `baseURL` ends in `/v1`. */
export function createFunctionCallModel(config: {
	baseURL: string;
	apiKey?: string;
	model: string;
	fetch?: typeof fetch;
}): LanguageModel {
	return createOpenAICompatible({
		name: PROVIDER_NAME,
		baseURL: config.baseURL,
		apiKey: config.apiKey,
		supportsStructuredOutputs: true,
		includeUsage: true,
		fetch: reportingTrouble(config.fetch),
	})(config.model);
}

export interface FillOnceInput {
	model: LanguageModel;
	messages: ChatMessage[];
	/** JSON schema the decoding is constrained to. */
	schema: Record<string, unknown>;
	maxOutputTokens: number;
	/** Default 0. */
	temperature?: number;
	/** Extra request-body fields (e.g. `{ reasoningEffort: "none" }` for Ollama), merged over the defaults. */
	providerOptions?: Record<string, JSONValue>;
	abortSignal?: AbortSignal;
}

export interface FillOnceResult {
	text: string;
	usage: { inputTokens?: number; outputTokens?: number };
	latencyMs: number;
}

/**
 * One schema-constrained chat completion (temperature 0 unless given). Always returns the
 * model's raw text, also when the SDK can't parse it as an object; only
 * transport errors throw. No SDK retries: the caller owns the correction loop.
 */
export async function fillOnce(input: FillOnceInput): Promise<FillOnceResult> {
	const startedAt = Date.now();
	try {
		const result = await generateText({
			model: input.model,
			messages: input.messages,
			allowSystemInMessages: true,
			output: Output.object({
				schema: jsonSchema(input.schema),
				name: "arguments",
			}),
			temperature: input.temperature ?? 0,
			maxOutputTokens: input.maxOutputTokens,
			// A hosted model (OpenRouter) answers 429 under load; the SDK backs off and retries.
			maxRetries: 3,
			abortSignal: input.abortSignal,
			providerOptions: {
				[PROVIDER_NAME]: {
					// Qwen3 "thinks" first by default: ~200 tokens and 10 s for one
					// argument object (measured), and the token budget can run out
					// before the JSON starts. The schema does the constraining.
					chat_template_kwargs: { enable_thinking: false },
					...input.providerOptions,
				},
			},
		});
		return {
			text: result.text,
			usage: {
				inputTokens: result.usage.inputTokens,
				outputTokens: result.usage.outputTokens,
			},
			latencyMs: Date.now() - startedAt,
		};
	} catch (error) {
		if (NoObjectGeneratedError.isInstance(error)) {
			return {
				text: error.text ?? "",
				usage: {
					inputTokens: error.usage?.inputTokens,
					outputTokens: error.usage?.outputTokens,
				},
				latencyMs: Date.now() - startedAt,
			};
		}
		if (APICallError.isInstance(error)) {
			throw new Error(
				`POST /chat/completions failed: ${error.statusCode ?? "no response"}`,
				{ cause: error },
			);
		}
		throw error;
	}
}

/** Corrections the model gets after its first answer: temperature 0 would repeat itself, so the problems go back with it. */
const MAX_ATTEMPTS = 3;

/**
 * HTTP client for `apps/delta-function-call` (llama-server, OpenAI-compatible):
 * one chat completion per tool call, decoding constrained to the tool's own
 * JSON schema (`response_format: json_schema`) so the answer is normally valid
 * JSON of the right shape. Still checked: an answer that is cut off, not an
 * object or breaks the schema (`validateArguments`) is first run through the
 * formatter (`repairArguments`); what that can't fix goes back to the model with
 * the problems named, up to two corrections, then it throws. Then optional fields the request
 * doesn't back are removed (`groundArguments`). Transport errors (HTTP, network)
 * are not retried. Temperature 0 by default — arguments must be reproducible. Every
 * attempt goes to telemetry and the usage ledger (as a `decision` call,
 * provider `delta`: a typed answer, no chat text).
 */
export function createFunctionCallAgent(
	config: FunctionCallAgentConfig,
): FunctionCallAgent {
	const model = createFunctionCallModel({ ...config, fetch: config.fetchImpl });
	const telemetry = config.telemetry ?? defaultTelemetry;

	function report(
		request: FunctionCallRequest,
		startedAt: number,
		outcome:
			| { ok: true; inputTokens?: number; outputTokens?: number }
			| { ok: false; error: string },
		trace: { prompt: string; tally: AttemptTally; response?: string },
	) {
		const latencyMs = Date.now() - startedAt;
		recordCall(
			config.usageRecorder,
			{
				...request.context,
				threadId: request.context?.threadId ?? "",
				userId: request.context?.userId ?? "",
				kind: "decision",
				provider: config.provider ?? PROVIDER_NAME,
				model: config.model,
				latencyMs,
				at: Date.now(),
				...trace,
				...attemptsOf(trace.tally),
				...outcome,
			},
			telemetry,
		);
	}

	return {
		async fillArguments(request) {
			const schema = request.tool.inputSchema;
			const messages = functionCallMessages(request);
			let lastProblem = "";
			for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
				const startedAt = Date.now();
				// Snapshot: `messages` grows with each correction below.
				const prompt = JSON.stringify(messages);
				const tally = newTally();
				let filled: FillOnceResult;
				try {
					filled = await tallyingAttempts(tally, () =>
						fillOnce({
							model,
							messages,
							schema,
							maxOutputTokens: config.maxOutputTokens ?? 256,
							temperature: config.temperature,
							providerOptions: config.providerOptions,
						}),
					);
				} catch (error) {
					report(
						request,
						startedAt,
						{
							ok: false,
							error: error instanceof Error ? error.message : String(error),
						},
						{ prompt, tally },
					);
					throw error;
				}

				const { text } = filled;
				// The formatter first (fences, trailing commas, "3" → 3, …); the model
				// only hears about what it could not fix mechanically.
				const repaired = repairArguments(text, schema);
				const args = repaired
					? groundArguments(schema, repaired, request.request)
					: undefined;
				const problems = args
					? validateArguments(schema, args).join("; ")
					: "the answer is not a complete JSON object (it may have been cut off)";
				if (args && !problems) {
					report(
						request,
						startedAt,
						{
							ok: true,
							inputTokens: filled.usage.inputTokens,
							outputTokens: filled.usage.outputTokens,
						},
						{ prompt, tally, response: text },
					);
					return args;
				}

				lastProblem = problems;
				report(
					request,
					startedAt,
					{ ok: false, error: problems },
					{ prompt, tally, response: text },
				);
				messages.push(
					{ role: "assistant", content: text },
					{
						role: "user",
						content: `That answer is not usable: ${problems}. Reply again with a single JSON object that fixes it.`,
					},
				);
			}
			throw new Error(`delta gave unusable arguments: ${lastProblem}`);
		},
	};
}
