import {
	intentFromToolNameCues,
	SHOP_TAXONOMY,
	type Taxonomy,
} from "@repo/intent-presets";
import { decideInRounds } from "#core/choice-rounds";
import type { DecisionAgent } from "#core/decision-types";
import type { FunctionCallAgent } from "#core/function-call-agent";
import { matchingAttributes } from "#core/goap/attribute-match";
import { cursorFact, fanOutFor } from "#core/goap/fan-out";
import {
	effectsOf,
	layaDescriptions,
	needsTheWords,
	preconditionsOf,
	type ToolIntent,
} from "#core/goap/intent-taxonomy";
import {
	countedItems,
	findZeroField,
	LIST_EMPTY,
	LIST_ITEM,
	LIST_READ,
	LISTED_ITEMS,
	looksEmpty,
	NAME_END,
	OUT_OF_STOCK,
	outOfStockNamed,
	parseListedItems,
	REMOVED_ITEMS,
	removalArguments,
	removesAtZero,
	SCOPE_ALL,
} from "#core/goap/list-removal";
import { PAGE_FACT, samePage } from "#core/goap/page";
import {
	FOUND_ITEMS,
	MISSING_ITEMS,
	REQUESTED_ITEMS,
	readItems,
	writeItems,
} from "#core/goap/shopping-list";
import { bindEnumValues, SPECIALIST_FACT } from "#core/goap/specialist";
import { recoveryFromToolError } from "#core/goap/tool-error-recovery";
import { buildArguments } from "#core/goap/tool-source";
import type {
	ActionContext,
	ActionResult,
	GoapAction,
	WorldState,
} from "#core/goap/types";
import {
	STATED_ATTRIBUTES,
	type UnderstoodAttribute,
} from "#core/goap/understanding";
import {
	describeParameterChoice,
	describeTool,
	destinationOf,
	NO_RESULTS,
} from "#core/goap/webmcp-steps";
import { recordCall } from "#core/record-call";
import type { UsageRecorder } from "#core/types";
import { UntranslatableError } from "#core/untranslatable-error";
import { collectTokens } from "#core/usage-collector";
import { validateArguments } from "#core/validate-arguments";

export interface WebMcpToolDescriptor {
	name: string;
	description?: string;
	inputSchema?: {
		type: "object";
		properties?: Record<string, unknown>;
		required?: string[];
	};
}

/** Fact: JSON `{ tool, params: [{ name, description }] }` — required parameters nothing could fill. Nothing was sent to the site; the reply asks the visitor. */
export const MISSING_PARAMS = "missingParams";

/** The shape of `WaitingOn.payload` when `WaitingOn.kind === "webmcp_tool_call"`. */
export interface WebMcpToolCallPayload {
	tool: string;
	arguments: Record<string, unknown>;
}

export interface CreateWebMcpActionsConfig {
	tools: WebMcpToolDescriptor[];
	decisionAgent: DecisionAgent;
	/** The channel's merged presets: what a tool's intent gives and needs. The shop's when unset. */
	taxonomy?: Taxonomy;
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
	/** Where the parameter choices (a decision call each) are reported, with their probabilities. */
	usageRecorder?: UsageRecorder;
}

/** Placeholder until real calibration data exists — matches `tool-source.ts`'s `DEFAULT_MCP_TOOL_COST`. */
const DEFAULT_WEBMCP_TOOL_COST = 3;
/** One Laya `choice` call, no browser round trip. */
const PARAM_CHOICE_COST = 1;

/** Longest tool answer kept in the world state (`webmcp:<tool>:text`). */
export const MAX_TOOL_TEXT_CHARS = 4000;

export const TOOL_INTENT_INSTRUCTIONS =
	"Which online-shop action does this tool most likely perform?";

/**
 * The tool's name decides when it can (the presets' tool cues); Laya sorts the
 * rest. Laya never starts a checkout or empties the cart on its own account:
 * a tool gets the intents that need the visitor's words only when its name says so.
 */
export async function classifyToolIntent(
	decisionAgent: DecisionAgent,
	tool: WebMcpToolDescriptor,
	taxonomy: Taxonomy = SHOP_TAXONOMY,
): Promise<ToolIntent> {
	const byName = intentFromToolNameCues(taxonomy, tool);
	// An edit tool whose schema says that 0 removes («quantity … 0 removes it»)
	// is how this site removes: the name («update_cart_item») cannot say it.
	if ((byName === undefined || byName === "other") && removesAtZero(tool)) {
		return "removeFromCart";
	}
	if (byName) return byName;
	const { choice } = await decideInRounds(
		decisionAgent,
		{ name: tool.name, description: tool.description ?? "" },
		{
			questionKey: "intent",
			instructions: TOOL_INTENT_INSTRUCTIONS,
			criteria: layaDescriptions(taxonomy),
		},
	);
	if (!choice || !(choice in taxonomy.intents)) return "other";
	return needsTheWords(taxonomy).has(choice) ? "other" : choice;
}

// --- reading what the tool answered ------------------------------------

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
	if (intent === "readState") {
		// The items the site lists, for a request about every one of them.
		const items = parseListedItems(text);
		return {
			facts: {
				[LISTED_ITEMS]: writeItems(items),
				[LIST_EMPTY]: items.length === 0 && looksEmpty(text) ? true : undefined,
			},
			failed: false,
		};
	}
	if (intent === "removeFromCart" && state[SCOPE_ALL] === true) {
		return {
			facts: { [REMOVED_ITEMS]: state[LISTED_ITEMS] as string | undefined },
			failed: false,
		};
	}
	if (intent === "addToCart") {
		// A tool that picked the items itself (a recipe, a bundle) had no search
		// before it: what it says it added is what the reply should name.
		if (state.product || readItems(state, FOUND_ITEMS).length > 0)
			return { facts: {}, failed: false };
		const added = countedItems(text);
		const [first] = added;
		return {
			facts: first
				? {
						product: first.name,
						quantity: first.quantity,
						[FOUND_ITEMS]: writeItems(added),
					}
				: {},
			failed: false,
		};
	}
	if (intent !== "search") return { facts: {}, failed: false };
	// `lastProduct` outlives the request (see `SESSION_FACTS`): «buy them» in
	// the next message buys it. A failed search empties it, so «buy them» never
	// buys what an older search found.
	if (outOfStockNamed(text, String(state.query ?? "")))
		return { facts: { lastProduct: "" }, failed: true };
	const product = firstListedProductName(text);
	if (product)
		return { facts: { product, lastProduct: product }, failed: false };
	if (NO_RESULTS.test(text))
		return { facts: { lastProduct: "" }, failed: true };
	return {
		facts:
			typeof state.query === "string"
				? { product: state.query, lastProduct: state.query }
				: {},
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
	"catalogLang",
	"lastProduct",
	REQUESTED_ITEMS,
	FOUND_ITEMS,
	MISSING_ITEMS,
	LISTED_ITEMS,
	REMOVED_ITEMS,
	SPECIALIST_FACT,
]);
const INTERNAL_PREFIXES = [
	"webmcp:",
	"toolResult:",
	"param:",
	"page:",
	"fanOut:",
];
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

/** Any letter that is not Latin: the message is not (only) English. */
const NOT_ENGLISH = /(?!\p{Script=Latin})\p{L}/u;

/**
 * Arguments for the browser call. The function-call model writes them when a
 * tool has parameters, merged under the facts that match parameter names
 * (`buildArguments`); no model, a failed call or an unusable answer falls back
 * to `buildArguments` alone — a missing model costs accuracy, not the run.
 * The model only works in English: for a message left untranslated (no
 * translator, or it failed) it is not called — shown the Russian request it
 * copied Russian words into the arguments, and given only the facts instead it
 * got 10% right (apps/benchmark, 2026-10-14), no better than the facts.
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
	const request = String(state.userMessageEn ?? state.userMessage ?? "");
	if (
		!agent ||
		Object.keys(schema.properties ?? {}).length === 0 ||
		NOT_ENGLISH.test(request)
	) {
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
			request,
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

// --- choosing a value for an enum parameter -------------------------

interface EnumParameter {
	name: string;
	values: string[];
	required: boolean;
	description?: string;
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

/** String parameters that only accept a fixed list of values, in schema order. */
function enumParameters(tool: WebMcpToolDescriptor): EnumParameter[] {
	const schema = tool.inputSchema;
	const result: EnumParameter[] = [];
	for (const [name, raw] of Object.entries(schema?.properties ?? {})) {
		const property = raw as { enum?: unknown[]; description?: string };
		const values = (property.enum ?? []).filter(
			(value): value is string => typeof value === "string",
		);
		if (values.length > 0) {
			result.push({
				name,
				values,
				required: schema?.required?.includes(name) ?? false,
				description: property.description,
				descriptions: describeValues(values, property.description),
			});
		}
	}
	return result;
}

/** A remover that has to be told WHAT to remove (it has required parameters). */
function needsItem(tool: WebMcpToolDescriptor): boolean {
	const schema = tool.inputSchema;
	const required = schema?.required;
	return required
		? required.length > 0
		: Object.keys(schema?.properties ?? {}).length > 0;
}

/** The extra option of an optional parameter: the message doesn't say. Never sent to the site. */
const NOT_SAID = "not_said";
/** The extra option of a required parameter: the visitor asked for something the list does not have. */
const NOT_IN_LIST = "not_in_list";
/** An optional parameter is set only when the model is at least this sure. */
const OPTIONAL_MIN_PROBABILITY = 0.5;

/** A required parameter the visitor asked for outside its list, as `missingParams` (the reply offers the list). */
function notInListFacts(
	state: Record<string, unknown>,
	tool: string,
	parameter: EnumParameter,
): string {
	let params: unknown[] = [];
	try {
		const earlier = JSON.parse(String(state[MISSING_PARAMS] ?? "null"));
		if (earlier?.tool === tool && Array.isArray(earlier.params)) {
			params = earlier.params;
		}
	} catch {}
	return JSON.stringify({
		tool,
		params: [
			...params,
			{
				name: parameter.name,
				description: parameter.description ?? "",
				options: parameter.values,
				notInList: true,
			},
		],
	});
}

function readStatedAttributes(
	state: Record<string, unknown>,
): UnderstoodAttribute[] | undefined {
	const raw = state[STATED_ATTRIBUTES];
	if (typeof raw !== "string") return undefined;
	try {
		const parsed: unknown = JSON.parse(raw);
		return Array.isArray(parsed)
			? (parsed as UnderstoodAttribute[])
			: undefined;
	} catch {
		return undefined;
	}
}

/** Fact set once the choice step of an enum parameter has run. */
export const parameterFlag = (tool: string, parameter: string) =>
	`param:${tool}:${parameter}`;

/**
 * Laya picks the value of an enum parameter (which of three stores) from the
 * user's message and the option descriptions in the tool's own schema —
 * bounded choice, the thing Laya does well. A value already in the state (the
 * shopper is already in a store) is kept. Costs one decision call, no browser.
 * A required parameter takes the first option when the request doesn't say;
 * an optional one has a "not said" option and stays unset then (the step is
 * still done, so it never blocks the tool).
 */
function createParameterChoiceAction(
	tool: WebMcpToolDescriptor,
	parameter: EnumParameter,
	decisionAgent: DecisionAgent,
	usageRecorder?: UsageRecorder,
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
			// alpha-understand listed what the visitor stated: only a parameter it
			// talks about is worth a model call (an optional one stays unset).
			// No list at all (understand failed/off) keeps asking, as before.
			const stated = readStatedAttributes(ctx.state);
			const said = stated ? matchingAttributes(stated, parameter) : [];
			if (stated && said.length === 0 && !parameter.required) {
				return { [flag]: true };
			}
			// Laya reads English: the translation of the message when there is one.
			let answers: Awaited<ReturnType<DecisionAgent["decide"]>> = {};
			try {
				const startedAt = Date.now();
				const { value, tokens } = await collectTokens(() =>
					decisionAgent.decide(
						{
							message: String(
								ctx.state.userMessageEn ?? ctx.state.userMessage ?? "",
							),
						},
						{
							[question]: {
								type: "choice",
								instructions: `Which ${parameter.name} does the user's request ask for?${
									parameter.description ? ` ${parameter.description}` : ""
								}${
									said.length
										? ` The visitor said: ${said.map((a) => `${a.name} = ${a.value}`).join(", ")}.`
										: ""
								} The options are listed in their order (${parameter.values.join(", ")}); when they form a scale, the most, biggest or highest means the last and the least or smallest the first. ${
									parameter.required
										? `When the request doesn't say, pick the first. When it asks for something that is none of these options, pick ${NOT_IN_LIST}.`
										: `When the request doesn't say, pick ${NOT_SAID}.`
								}`,
								criteria: parameter.required
									? {
											...parameter.descriptions,
											[NOT_IN_LIST]:
												"The request asks for something that is none of these options.",
										}
									: {
											...parameter.descriptions,
											[NOT_SAID]: "The request does not say.",
										},
							},
						},
					),
				);
				answers = value;
				recordCall(usageRecorder, {
					threadId: String(ctx.state.threadId ?? ""),
					userId: String(ctx.state.userId ?? ""),
					planRunId:
						typeof ctx.state.planRunId === "string"
							? ctx.state.planRunId
							: undefined,
					actionName: `choose:${question}`,
					kind: "decision",
					provider: "laya",
					model: "gamma-decision",
					latencyMs: Date.now() - startedAt,
					at: Date.now(),
					ok: true,
					...tokens,
				});
			} catch (error) {
				// Nothing could be translated for Laya: the same as a request that
				// doesn't say — the first option (what the instruction above asks).
				if (!(error instanceof UntranslatableError)) throw error;
			}
			const answer = answers[question];
			const picked = answer?.type === "choice" ? answer.choice : undefined;
			const valid = picked && parameter.values.includes(picked);
			if (parameter.required && picked === NOT_IN_LIST) {
				return {
					[flag]: true,
					[MISSING_PARAMS]: notInListFacts(ctx.state, tool.name, parameter),
				};
			}
			if (parameter.required) {
				return {
					[parameter.name]: valid ? picked : (parameter.values[0] as string),
					[flag]: true,
				};
			}
			const sure =
				answer?.type !== "choice" ||
				(answer.probabilities?.[picked as string] ?? 1) >=
					OPTIONAL_MIN_PROBABILITY;
			return valid && sure
				? { [parameter.name]: picked, [flag]: true }
				: { [flag]: true };
		},
	};
}

// --- the tool actions ----------------------------------------------------

/**
 * Turns a widget-supplied WebMCP tool list into `GoapAction`s — the WebMCP
 * counterpart of `createMcpToolSource` (`tool-source.ts`). Each tool is
 * classified once (one Laya `choice` call, `TOOL_INTENTS`), and the intent
 * gives it real preconditions/effects, so the planner chains them: choose a
 * store → search → add to cart. Every enum parameter gets its own
 * Laya step that picks the value (see `createParameterChoiceAction`).
 *
 * A WebMCP tool call can only execute in the visitor's browser (see
 * apps/docs/content/en/drafts/laya-autonomous-webmcp.md, "WebMCP vs MCP"), so `execute()` never
 * calls anything itself — it either reads a result the browser already
 * reported (`webmcp:<name>:result`, plus the answer text in
 * `webmcp:<name>:text`, written by the orchestrator on resume) or asks the
 * run to pause (`{ waiting: { kind: "webmcp_tool_call", ... } }`).
 */
export async function createWebMcpActions(
	config: CreateWebMcpActionsConfig,
): Promise<GoapAction[]> {
	const costFor = config.costFor ?? (() => DEFAULT_WEBMCP_TOOL_COST);
	const taxonomy = config.taxonomy ?? SHOP_TAXONOMY;

	/** Tools classified as searches: their answers are what later calls copy names from. */
	const searchTools = new Set<string>();
	/** Every tool's intent, filled while classifying (read by the error recovery, long after). */
	const intentOf = new Map<string, ToolIntent>();

	const perTool = await Promise.all(
		config.tools.map(async (tool): Promise<GoapAction[]> => {
			const intent = await classifyToolIntent(
				config.decisionAgent,
				tool,
				taxonomy,
			);
			if (intent === "search") searchTools.add(tool.name);
			intentOf.set(tool.name, intent);
			const toolResultKey = `toolResult:${tool.name}`;
			const resultKey = `webmcp:${tool.name}:result`;
			const textKey = `webmcp:${tool.name}:text`;
			const recoveryKey = `recovery:${tool.name}`;

			const parameters = enumParameters(tool);
			const choices = parameters.map((parameter) =>
				createParameterChoiceAction(
					tool,
					parameter,
					config.decisionAgent,
					config.usageRecorder,
				),
			);
			const needsChoices = Object.fromEntries(
				parameters.map((parameter) => [
					parameterFlag(tool.name, parameter.name),
					true,
				]),
			);

			const action: GoapAction = {
				name: tool.name,
				// A specialist (add_recipe_to_cart) costs more than the plain tool of its intent (add_to_cart).
				cost: costFor(tool) + taxonomy.specialistPenalty(tool.name, intent),
				preconditions: {
					...preconditionsOf(intent, taxonomy),
					...needsChoices,
				},
				effects: { ...effectsOf(intent, taxonomy), [toolResultKey]: true },
				describe: describeTool(tool, intent),
				description: tool.description,
				...(parameters.length > 0
					? {
							options: Object.fromEntries(
								parameters.map((p) => [p.name, p.values]),
							),
						}
					: {}),
				// «Remove everything» through a tool that removes one named thing:
				// the list is read first (`bindListScope`). A tool that needs no
				// item (clear_cart) has no such wait.
				...(intent === "removeFromCart" && needsItem(tool)
					? { scopedPreconditions: { [LIST_READ]: true } }
					: {}),
				// A message that says one of this tool's options is a request for it (`specialist.ts`).
				bindToRequest: bindEnumValues(tool, intent, (parameter) =>
					parameterFlag(tool.name, parameter),
				),
				async execute(ctx: ActionContext): Promise<ActionResult> {
					const resultFact = ctx.state[resultKey];
					// Every item of a list the site showed: nothing listed means
					// nothing to remove (told truthfully from the answer, not from a
					// model's guess); a list this could not read is a failed step.
					if (intent === "removeFromCart" && ctx.state[SCOPE_ALL] === true) {
						if (ctx.state[LIST_READ] === true) {
							if (ctx.state[LIST_EMPTY] === true) {
								return {
									...effectsOf(intent, taxonomy),
									[toolResultKey]: true,
								};
							}
							if (readItems(ctx.state, LISTED_ITEMS).length === 0) {
								return { [toolResultKey]: false };
							}
						}
					}
					// Several things asked for at once: this tool is called once per
					// thing, a waiting run at a time (`fan-out.ts`).
					const fan = fanOutFor(
						tool,
						intent,
						ctx.state,
						firstListedProductName,
					);
					let callState = ctx.state;
					let carried: Partial<WorldState> | undefined;
					if (fan && resultFact === "ok") {
						const step = fan.advance(
							ctx.state,
							String(ctx.state[textKey] ?? ""),
						);
						if (step.done) {
							return step.failed
								? { [toolResultKey]: false, ...step.facts }
								: {
										...effectsOf(intent, taxonomy),
										[toolResultKey]: true,
										...step.facts,
									};
						}
						// The answer is consumed; the next call's checkpoint starts clean.
						carried = {
							...step.facts,
							[resultKey]: undefined,
							[textKey]: undefined,
						};
					}
					if (fan && resultFact !== "error") {
						callState = fan.callState(ctx.state, carried ?? {});
					}
					if (resultFact === "ok" && !fan) {
						const text = String(ctx.state[textKey] ?? "");
						const { facts, failed } = factsFromAnswer(intent, text, ctx.state);
						// A search that found nothing did not do its job.
						if (failed) return { [toolResultKey]: false, ...facts };
						return {
							...effectsOf(intent, taxonomy),
							[toolResultKey]: true,
							...(intent === "navigate" ? { pageAlreadyOpen: false } : {}),
							...facts,
						};
					}
					if (resultFact === "error") {
						// The site's own error may name the step that is missing
						// ("Call choose_store first"): invalidate that tool's effects so
						// the plan runs it and then repeats this call. Once per distinct
						// error text — the same error again, after the recovery, is final.
						const errorText = String(ctx.state[textKey] ?? "");
						const recovery =
							ctx.state[recoveryKey] === errorText
								? undefined
								: recoveryFromToolError(
										errorText,
										tool.name,
										config.tools.flatMap((other) => {
											const otherIntent = intentOf.get(other.name);
											return otherIntent
												? [{ name: other.name, intent: otherIntent }]
												: [];
										}),
									);
						if (!recovery) return { [toolResultKey]: false };
						return {
							...recovery.facts,
							[recoveryKey]: errorText,
							[toolResultKey]: false,
							[resultKey]: undefined,
						};
					}
					// A choice step found the visitor asked for a value this tool does
					// not offer: no call, the reply offers what there is.
					if (
						typeof callState[MISSING_PARAMS] === "string" &&
						callState[MISSING_PARAMS].includes(
							`"tool":${JSON.stringify(tool.name)}`,
						)
					) {
						return { [toolResultKey]: false };
					}
					// A list of found things fills the tool's list parameter in code;
					// no model is asked to copy names.
					const fromList =
						intent === "addToCart" &&
						readItems(callState, FOUND_ITEMS).length > 1;
					const schema = tool.inputSchema ?? { type: "object" as const };
					// The items to remove come from the list the site showed, the
					// field to fill from the tool's schema: no model, no names.
					const listed =
						intent === "removeFromCart" && callState[SCOPE_ALL] === true
							? readItems(callState, LISTED_ITEMS)
							: [];
					const cursor = Number(callState[cursorFact(tool.name)] ?? 0);
					const removal =
						listed.length > 0
							? removalArguments(
									schema,
									fan ? listed.slice(cursor, cursor + 1) : listed,
								)
							: undefined;
					const zero =
						intent === "removeFromCart" ? findZeroField(schema) : undefined;
					const args = removal
						? removal
						: fromList
							? buildArguments(callState, schema)
							: await argumentsFor(
									tool,
									callState,
									config.functionCallAgent,
									config.onError,
									searchTools,
								);
					// A removal by setting a number to 0 (any single product too).
					if (zero && !removal) args[zero] = 0;
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
						// Not the site's failure: the visitor has not said everything yet.
						const properties = (schema.properties ?? {}) as Record<
							string,
							{ description?: string }
						>;
						const params = (schema.required ?? [])
							.filter(
								(name) =>
									args[name] === undefined ||
									args[name] === null ||
									args[name] === "",
							)
							.map((name) => ({
								name,
								description: properties[name]?.description ?? "",
							}));
						return {
							[toolResultKey]: false,
							...(params.length > 0
								? {
										[MISSING_PARAMS]: JSON.stringify({
											tool: tool.name,
											params,
										}),
									}
								: {}),
						};
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
							...effectsOf(intent, taxonomy),
							[toolResultKey]: true,
							pageAlreadyOpen: true,
						};
					}
					const payload: WebMcpToolCallPayload = {
						tool: tool.name,
						arguments: args,
					};
					return {
						waiting: { kind: "webmcp_tool_call", payload },
						...(carried ? { facts: carried } : {}),
					};
				},
			};
			return [...choices, action];
		}),
	);
	return perTool.flat();
}
