import { groundArguments } from "./ground-arguments";
import { createBearerJsonClient } from "./http-client";
import { repairArguments } from "./repair-arguments";
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
	usageRecorder?: UsageRecorder;
	telemetry?: ReturnType<typeof createTelemetry>;
	fetchImpl?: typeof fetch;
}

/**
 * The rules of the job, picked with `apps/tools-benchmark` (prompt v2: worked
 * examples per kind of call; with the schema-constrained decoding and
 * `groundArguments` below it filled 71% of the benchmark cases exactly).
 */
export const FUNCTION_CALL_SYSTEM_PROMPT = [
	"You fill in the arguments of ONE tool call for an online grocery shop.",
	"Reply with a single JSON object that matches the tool's input schema, nothing else.",
	"",
	"Rules:",
	"- Use only what the request, the known facts and the last tool answer say. Never invent values.",
	"- Leave every optional field out unless the request clearly asks for it: no department, no price limit, no diet unless the shopper said so.",
	"- Search `query` is just the product, in singular or plural as said; diets, prices and aisles go in their own fields, never in the query.",
	"- To add a product, copy ONE exact name from the last tool answer or the known facts: the first in-stock one that fits the request. Add several products only if the request names several.",
	"- To change a cart line, use the product from the known facts or the request.",
	"- For a dish: if it is one of the `recipe` values, use only that. Otherwise list the 6-10 grocery items a typical recipe needs in `ingredients`, plain names without amounts.",
	"",
	"Examples (other products):",
	'Request: two lemons, answer lists "- Meyer Lemons — in stock" => {"items":[{"product":"Meyer Lemons","quantity":2}]}',
	'Request: find rice under 3 dollars => {"query":"rice","max_price":3}',
	'Request: vegan sausages => {"query":"sausages","dietary":["vegan"]}',
	'Request: show the frozen aisle => {"department":"Frozen"}',
	'Request: make it 5, fact product "Tofu" => {"product":"Tofu","quantity":5}',
].join("\n");

interface Completion {
	choices?: { message?: { content?: string | null } }[];
	usage?: { prompt_tokens?: number; completion_tokens?: number };
}

/**
 * The 1.7B model copies words of a non-English request into the arguments
 * ("сыр" for a catalog that says "cheese") even when the known facts hold the
 * English ones (measured on delta, 2026-10-02), so it is not shown such a
 * request at all — the facts carry what the shopper wants.
 */
const NOT_ENGLISH = /(?!\p{Script=Latin})\p{L}/u;
const SEE_FACTS = "(not in English: use the known facts)";

function userMessage(request: FunctionCallRequest): string {
	return [
		`Tool: ${request.tool.name}`,
		`What it does: ${request.tool.description ?? ""}`,
		`Known facts: ${JSON.stringify(request.facts)}`,
		"Last tool answer:",
		request.lastAnswer ?? "(none)",
		`Request: ${NOT_ENGLISH.test(request.request) ? SEE_FACTS : request.request}`,
	].join("\n");
}

interface ChatMessage {
	role: "system" | "user" | "assistant";
	content: string;
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
 * are not retried. Temperature 0 — arguments must be reproducible. Every
 * attempt goes to telemetry and the usage ledger (as a `decision` call,
 * provider `delta`: a typed answer, no chat text).
 */
export function createFunctionCallAgent(
	config: FunctionCallAgentConfig,
): FunctionCallAgent {
	const postJson = createBearerJsonClient(config);
	const telemetry = config.telemetry ?? defaultTelemetry;

	function report(
		request: FunctionCallRequest,
		startedAt: number,
		outcome:
			| { ok: true; inputTokens?: number; outputTokens?: number }
			| { ok: false; error: string },
	) {
		const latencyMs = Date.now() - startedAt;
		telemetry.logLlmState({
			provider: "delta",
			model: config.model,
			latencyMs,
			...outcome,
		});
		config.usageRecorder?.record({
			...request.context,
			threadId: request.context?.threadId ?? "",
			userId: request.context?.userId ?? "",
			kind: "decision",
			provider: "delta",
			model: config.model,
			latencyMs,
			at: Date.now(),
			...outcome,
		});
	}

	return {
		async fillArguments(request) {
			const schema = request.tool.inputSchema;
			const messages: ChatMessage[] = [
				{ role: "system", content: FUNCTION_CALL_SYSTEM_PROMPT },
				{ role: "user", content: userMessage(request) },
			];
			let lastProblem = "";
			for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
				const startedAt = Date.now();
				let completion: Completion;
				try {
					completion = await postJson<Completion>("/chat/completions", {
						model: config.model,
						temperature: 0,
						// Qwen3 "thinks" first by default: ~200 tokens and 10 s for one
						// argument object (measured), and the budget below can run out
						// before the JSON starts. The schema does the constraining.
						chat_template_kwargs: { enable_thinking: false },
						max_tokens: config.maxOutputTokens ?? 256,
						messages,
						response_format: {
							type: "json_schema",
							json_schema: { name: "arguments", strict: true, schema },
						},
					});
				} catch (error) {
					report(request, startedAt, {
						ok: false,
						error: error instanceof Error ? error.message : String(error),
					});
					throw error;
				}

				const text = completion.choices?.[0]?.message?.content ?? "";
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
					report(request, startedAt, {
						ok: true,
						inputTokens: completion.usage?.prompt_tokens,
						outputTokens: completion.usage?.completion_tokens,
					});
					return args;
				}

				lastProblem = problems;
				report(request, startedAt, { ok: false, error: problems });
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
