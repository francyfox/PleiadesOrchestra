import type { DecisionAgent } from "../decision-types";
import type { FunctionCallAgent } from "../function-call-agent";
import { validateArguments } from "../validate-arguments";
import {
	EFFECTS_BY_INTENT,
	INTENT_DESCRIPTIONS,
	PRECONDITIONS_BY_INTENT,
	TOOL_INTENTS,
	type ToolIntent,
} from "./intent-taxonomy";
import { PAGE_FACT, samePage } from "./page";
import { buildArguments } from "./tool-source";
import type {
	ActionContext,
	ActionResult,
	GoapAction,
	WorldState,
} from "./types";
import {
	describeParameterChoice,
	describeTool,
	destinationOf,
	NO_RESULTS,
} from "./webmcp-steps";

export interface WebMcpToolDescriptor {
	name: string;
	description?: string;
	inputSchema?: {
		type: "object";
		properties?: Record<string, unknown>;
		required?: string[];
	};
}

/** The shape of `WaitingOn.payload` when `WaitingOn.kind === "webmcp_tool_call"`. */
export interface WebMcpToolCallPayload {
	tool: string;
	arguments: Record<string, unknown>;
}

export interface CreateWebMcpActionsConfig {
	tools: WebMcpToolDescriptor[];
	decisionAgent: DecisionAgent;
	/**
	 * Writes each tool call's arguments as JSON (`delta-function-call`). Laya
	 * still picks WHICH tool runs; this only fills in its parameters. Without
	 * it — or when it fails — arguments come from `buildArguments`, matching
	 * facts to parameter names.
	 */
	functionCallAgent?: FunctionCallAgent;
	/** Called when the function-call model fails or a call's arguments stay incomplete; never throws into the run. */
	onError?: (error: unknown, context: { tool: string }) => void;
	/** Real resource cost per tool — a browser round trip's latency varies with the tool, so this is a hook, not a constant, mirroring `McpToolSourceConfig.costFor`. */
	costFor?: (tool: WebMcpToolDescriptor) => number;
}

/** Placeholder until real calibration data exists — matches `tool-source.ts`'s `DEFAULT_MCP_TOOL_COST`. */
const DEFAULT_WEBMCP_TOOL_COST = 3;
/** One Laya `choice` call, no browser round trip. */
const PARAM_CHOICE_COST = 1;

/** Longest tool answer kept in the world state (`webmcp:<tool>:text`). */
export const MAX_TOOL_TEXT_CHARS = 4000;

async function classifyToolIntent(
	decisionAgent: DecisionAgent,
	tool: WebMcpToolDescriptor,
): Promise<ToolIntent> {
	const answers = await decisionAgent.decide(
		{ name: tool.name, description: tool.description ?? "" },
		{
			intent: {
				type: "choice",
				instructions:
					"Which online-shop action does this tool most likely perform?",
				criteria: { ...INTENT_DESCRIPTIONS },
			},
		},
	);
	const answer = answers.intent;
	const choice = answer?.type === "choice" ? answer.choice : undefined;
	return choice && (TOOL_INTENTS as readonly string[]).includes(choice)
		? (choice as ToolIntent)
		: "other";
}

// --- reading what the tool answered ------------------------------------

const OUT_OF_STOCK = /out of stock|unavailable|sold out/i;
const LIST_ITEM = /^\s*(?:[-*•]|\d+[.)])\s+(.+)$/;
const NAME_END = /\s+[—–-]\s+|\s+\(|\s+\$\d/;

/**
 * Name of the first product in a search answer that is a bulleted/numbered
 * list ("- Swiss Cheese — $4.49 (6 oz) — in stock"), skipping lines marked out
 * of stock. Search tools answer in free text, so this is a heuristic: when
 * nothing matches the result is `undefined` and the step counts as failed.
 */
export function firstListedProductName(text: string): string | undefined {
	for (const line of text.split("\n")) {
		const item = line.match(LIST_ITEM)?.[1];
		if (!item || OUT_OF_STOCK.test(item)) continue;
		const name = item.split(NAME_END)[0]?.trim();
		if (name) return name;
	}
	return undefined;
}

/**
 * Facts a successful tool call adds on top of the intent's usual effects. For
 * a search that is the product the next step will add: the first in-stock item
 * of the answer. An answer that says nothing matched is a failed search; one
 * in a format this cannot read falls back to the search query itself, and the
 * site's own name matching decides.
 */
function factsFromAnswer(
	intent: ToolIntent,
	text: string,
	state: WorldState,
): { facts: Partial<WorldState>; failed: boolean } {
	if (intent !== "search") return { facts: {}, failed: false };
	const product = firstListedProductName(text);
	if (product) return { facts: { product }, failed: false };
	if (NO_RESULTS.test(text)) return { facts: {}, failed: true };
	return {
		facts: typeof state.query === "string" ? { product: state.query } : {},
		failed: false,
	};
}

// --- the arguments of a tool call ---------------------------------------

/** Facts that are bookkeeping, not something the model should read. */
const INTERNAL_FACTS = new Set([
	"userMessage",
	"threadId",
	"userId",
	"planRunId",
	"messageIntent",
]);
const INTERNAL_PREFIXES = ["webmcp:", "toolResult:", "param:", "page:"];
const MAX_FACT_CHARS = 200;
/** Longest tool answer shown to the function-call model (its context is small). */
const MAX_ANSWER_CHARS = 1500;

/** Short, plain facts of the run for the prompt. */
function factsForModel(state: WorldState): Record<string, unknown> {
	const facts: Record<string, unknown> = {};
	for (const [key, value] of Object.entries(state)) {
		if (INTERNAL_FACTS.has(key)) continue;
		if (INTERNAL_PREFIXES.some((prefix) => key.startsWith(prefix))) continue;
		if (typeof value === "string" && value.length <= MAX_FACT_CHARS) {
			facts[key] = value;
		} else if (typeof value === "number") {
			facts[key] = value;
		}
		// Booleans are the planner's bookkeeping (`storeOpen`, `requestParsed`):
		// shown to a 1.7B model they only invite made-up arguments.
	}
	return facts;
}

/**
 * The newest answer of a *search* tool (`webmcp:<tool>:text`), cut short — the
 * product names the next call copies. Answers of other steps are left out on
 * purpose: shown the store's department list after `choose_store`, the model
 * answered a search with `{"department":"Produce"}` (measured 2026-10-02).
 */
function lastSearchAnswer(
	state: WorldState,
	searchTools: ReadonlySet<string>,
): string | undefined {
	const texts = Object.entries(state).filter(
		([key, value]) =>
			key.startsWith("webmcp:") &&
			key.endsWith(":text") &&
			searchTools.has(key.slice("webmcp:".length, -":text".length)) &&
			typeof value === "string",
	);
	const last = texts.at(-1)?.[1] as string | undefined;
	return last?.slice(0, MAX_ANSWER_CHARS);
}

/**
 * Arguments for the browser call. The function-call model writes them when a
 * tool has parameters, merged under the facts that match parameter names
 * (`buildArguments`); no model, a failed call or an unusable answer falls back
 * to `buildArguments` alone — a missing model costs accuracy, not the run.
 */
async function argumentsFor(
	tool: WebMcpToolDescriptor,
	state: WorldState,
	agent: FunctionCallAgent | undefined,
	onError: CreateWebMcpActionsConfig["onError"],
	searchTools: ReadonlySet<string>,
): Promise<Record<string, unknown>> {
	const schema = tool.inputSchema ?? { type: "object" as const };
	const mechanical = () => buildArguments(state, schema);
	if (!agent || Object.keys(schema.properties ?? {}).length === 0) {
		return mechanical();
	}
	try {
		const written = await agent.fillArguments({
			tool: {
				name: tool.name,
				description: tool.description,
				inputSchema: schema,
			},
			facts: factsForModel(state),
			lastAnswer: lastSearchAnswer(state, searchTools),
			request: String(state.userMessage ?? ""),
			context: {
				threadId: String(state.threadId ?? ""),
				userId: String(state.userId ?? ""),
				planRunId:
					typeof state.planRunId === "string" ? state.planRunId : undefined,
				actionName: tool.name,
			},
		});
		// What earlier steps already settled (the parsed query, the product the
		// search picked) beats what a small model wrote for the same parameter;
		// the model adds the rest (filters, ingredients, …).
		return { ...written, ...mechanical() };
	} catch (error) {
		onError?.(error, { tool: tool.name });
		return mechanical();
	}
}

// --- choosing a value for a required enum parameter -------------------------

interface EnumParameter {
	name: string;
	values: string[];
	/** Free-text description of the parameter, split per value where it says "<value>: …". */
	descriptions: Record<string, string | null>;
}

/** Splits "A: fast. B: cheap." into `{ A: "fast.", B: "cheap." }` for the known values. */
function describeValues(
	values: string[],
	text: string | undefined,
): Record<string, string | null> {
	const found = values
		.map((value) => ({ value, at: text ? text.indexOf(`${value}:`) : -1 }))
		.filter((hit) => hit.at !== -1)
		.sort((a, b) => a.at - b.at);
	const result: Record<string, string | null> = Object.fromEntries(
		values.map((value) => [value, null]),
	);
	found.forEach((hit, i) => {
		const from = hit.at + hit.value.length + 1;
		const to = found[i + 1]?.at ?? text?.length ?? from;
		result[hit.value] = text?.slice(from, to).trim() || null;
	});
	return result;
}

/** Required string parameters that only accept a fixed list of values. */
function requiredEnumParameters(tool: WebMcpToolDescriptor): EnumParameter[] {
	const schema = tool.inputSchema as
		| { properties?: Record<string, unknown>; required?: string[] }
		| undefined;
	const result: EnumParameter[] = [];
	for (const name of schema?.required ?? []) {
		const property = schema?.properties?.[name] as
			| { enum?: unknown[]; description?: string }
			| undefined;
		const values = (property?.enum ?? []).filter(
			(value): value is string => typeof value === "string",
		);
		if (values.length > 0) {
			result.push({
				name,
				values,
				descriptions: describeValues(values, property?.description),
			});
		}
	}
	return result;
}

const parameterFlag = (tool: string, parameter: string) =>
	`param:${tool}:${parameter}`;

/**
 * Laya picks the value of an enum parameter (which of three stores) from the
 * user's message and the option descriptions in the tool's own schema —
 * bounded choice, the thing Laya does well. A value already in the state (the
 * shopper is already in a store) is kept. Costs one decision call, no browser.
 */
function createParameterChoiceAction(
	tool: WebMcpToolDescriptor,
	parameter: EnumParameter,
	decisionAgent: DecisionAgent,
): GoapAction {
	const flag = parameterFlag(tool.name, parameter.name);
	const question = `${tool.name}.${parameter.name}`;
	return {
		name: `choose:${question}`,
		cost: PARAM_CHOICE_COST,
		preconditions: {},
		effects: { [flag]: true },
		describe: describeParameterChoice(parameter.name),
		async execute(ctx: ActionContext): Promise<ActionResult> {
			const current = ctx.state[parameter.name];
			if (typeof current === "string" && parameter.values.includes(current)) {
				return { [flag]: true };
			}
			const answers = await decisionAgent.decide(
				{ message: String(ctx.state.userMessage ?? "") },
				{
					[question]: {
						type: "choice",
						instructions: `Which ${parameter.name} fits the user's request best? When the request doesn't say, pick the first.`,
						criteria: parameter.descriptions,
					},
				},
			);
			const answer = answers[question];
			const picked = answer?.type === "choice" ? answer.choice : undefined;
			const value =
				picked && parameter.values.includes(picked)
					? picked
					: (parameter.values[0] as string);
			return { [parameter.name]: value, [flag]: true };
		},
	};
}

// --- the tool actions ----------------------------------------------------

/**
 * Turns a widget-supplied WebMCP tool list into `GoapAction`s — the WebMCP
 * counterpart of `createMcpToolSource` (`tool-source.ts`). Each tool is
 * classified once (one Laya `choice` call, `TOOL_INTENTS`), and the intent
 * gives it real preconditions/effects, so the planner chains them: choose a
 * store → search → add to cart. Every required enum parameter gets its own
 * Laya step that picks the value (see `createParameterChoiceAction`).
 *
 * A WebMCP tool call can only execute in the visitor's browser (see
 * docs/laya-autonomous-webmcp.md, "WebMCP vs MCP"), so `execute()` never
 * calls anything itself — it either reads a result the browser already
 * reported (`webmcp:<name>:result`, plus the answer text in
 * `webmcp:<name>:text`, written by the orchestrator on resume) or asks the
 * run to pause (`{ waiting: { kind: "webmcp_tool_call", ... } }`).
 */
export async function createWebMcpActions(
	config: CreateWebMcpActionsConfig,
): Promise<GoapAction[]> {
	const costFor = config.costFor ?? (() => DEFAULT_WEBMCP_TOOL_COST);

	/** Tools classified as searches: their answers are what later calls copy names from. */
	const searchTools = new Set<string>();

	const perTool = await Promise.all(
		config.tools.map(async (tool): Promise<GoapAction[]> => {
			const intent = await classifyToolIntent(config.decisionAgent, tool);
			if (intent === "search") searchTools.add(tool.name);
			const toolResultKey = `toolResult:${tool.name}`;
			const resultKey = `webmcp:${tool.name}:result`;
			const textKey = `webmcp:${tool.name}:text`;

			const parameters = requiredEnumParameters(tool);
			const choices = parameters.map((parameter) =>
				createParameterChoiceAction(tool, parameter, config.decisionAgent),
			);
			const needsChoices = Object.fromEntries(
				parameters.map((parameter) => [
					parameterFlag(tool.name, parameter.name),
					true,
				]),
			);

			const action: GoapAction = {
				name: tool.name,
				cost: costFor(tool),
				preconditions: { ...PRECONDITIONS_BY_INTENT[intent], ...needsChoices },
				effects: { ...EFFECTS_BY_INTENT[intent], [toolResultKey]: true },
				describe: describeTool(tool, intent),
				async execute(ctx: ActionContext): Promise<ActionResult> {
					const resultFact = ctx.state[resultKey];
					if (resultFact === "ok") {
						const text = String(ctx.state[textKey] ?? "");
						const { facts, failed } = factsFromAnswer(intent, text, ctx.state);
						// A search that found nothing did not do its job.
						if (failed) return { [toolResultKey]: false };
						return {
							...EFFECTS_BY_INTENT[intent],
							[toolResultKey]: true,
							...(intent === "navigate" ? { pageAlreadyOpen: false } : {}),
							...facts,
						};
					}
					if (resultFact === "error") {
						return { [toolResultKey]: false };
					}
					const args = await argumentsFor(
						tool,
						ctx.state,
						config.functionCallAgent,
						config.onError,
						searchTools,
					);
					// A call the schema would reject is not worth a browser round trip.
					const problems = validateArguments(
						tool.inputSchema ?? { type: "object" },
						args,
					);
					if (problems.length > 0) {
						config.onError?.(
							new Error(
								`${tool.name}: ${problems.join("; ")} (arguments for the call are incomplete)`,
							),
							{ tool: tool.name },
						);
						return { [toolResultKey]: false };
					}
					// The visitor is already on that page (language and tracking
					// parameters aside): the effect holds without a browser round trip.
					const destination =
						intent === "navigate" ? destinationOf(args) : undefined;
					if (
						destination &&
						samePage(
							typeof ctx.state[PAGE_FACT] === "string"
								? ctx.state[PAGE_FACT]
								: undefined,
							destination,
						)
					) {
						return {
							...EFFECTS_BY_INTENT[intent],
							[toolResultKey]: true,
							pageAlreadyOpen: true,
						};
					}
					const payload: WebMcpToolCallPayload = {
						tool: tool.name,
						arguments: args,
					};
					return { waiting: { kind: "webmcp_tool_call", payload } };
				},
			};
			return [...choices, action];
		}),
	);
	return perTool.flat();
}
