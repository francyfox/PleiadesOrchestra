import type {
	CallContext,
	CollectedTokens,
	DecomposedTask,
	GoapAction,
	IntentVerdict,
	Taxonomy,
	Understanding,
	UnderstoodAttribute,
	UnderstoodItem,
	WorldState,
} from "@repo/core";
import {
	attributeFacts,
	bindListScope,
	chooseTool,
	classifyMessageIntentDetailed,
	collectTokens,
	decomposeMessage,
	decompositionDescriptions,
	goalForIntent,
	looksLikeSeveralTasks,
	MAX_TOOL_TEXT_CHARS,
	matchSpecialist,
	mustAskOrder,
	needsTheWords,
	PAGE_FACT,
	PAGE_LANG_FACT,
	parsePage,
	preferSpecialist,
	REQUESTED_ITEMS,
	recordCall,
	reuseLastProduct,
	runnableTasks,
	STATED_ATTRIBUTES,
	scopeFacts,
	TIME_ZONE_FACT,
	TODAY_FACT,
	understandMessage,
} from "@repo/core";
import { intentFromMessageCues, SHOP_TAXONOMY } from "@repo/intent-presets";
import {
	customerFacts,
	lastToolAnswer,
	REMOVAL_REPLY_ACTION,
	REPLY_ACTION,
	REPLY_GOAL,
	TEMPLATE_REPLY_ACTION,
} from "../goap/goap.service.ts";
import {
	LANG_CHOSEN_FACT,
	PERSONA_LANG_FACT,
	REPLY_TO_FACT,
	USER_STORED_FACT,
} from "../goap/goap.types.ts";
import { learnIntent } from "../intents/intents.service.ts";
import {
	finishPlanRun,
	joinRequest,
	startPlanRun,
} from "../plan-runs/plan-runs.service.ts";
import {
	AWAITED_ARGS_FACT,
	AWAITED_TOOL_FACT,
	VISITOR_WAIT_FACT,
} from "../run-stream/run-stream.service.ts";
import { sessionFacts } from "../run-stream/run-stream.ts";
import type { PreparedRun } from "../run-stream/run-stream.types.ts";
import {
	chainFacts,
	outcomeOf,
	type QueuedTask,
	readOutcomes,
	readQueue,
	TASKS_STARTED_FACT,
	turnFacts,
} from "../tasks/tasks.service.ts";
import { normalizeText } from "../text/text.service.ts";
import type { VisitorRow } from "../visitors/visitors.types.ts";
import type { ReplyOptions, ToolOutcome } from "../widget/widget.types.ts";
import type { ReplyDeps } from "./reply.types.ts";

/**
 * Per-thread actions (`threadActionsFor`) plus the WebMCP actions registered
 * for this thread when the widget's panel opened. The catalog is not sent
 * with each message: classifying a whole tool catalog through the decision
 * model on every message was slow and too large for the message size limit.
 */
export async function resolveDynamicActions(
	deps: ReplyDeps,
	threadId: string,
): Promise<GoapAction[]> {
	const webmcpActions = deps.webmcpCatalog.get(threadId) ?? [];
	if (!deps.threadActionsFor) return webmcpActions;
	const threadActions = await deps.threadActionsFor(threadId);
	return [...threadActions, ...webmcpActions];
}

/**
 * Facts about the page the visitor is on: `page:path` (path and query as the
 * browser shows them) and `page:lang` (from `/ru/…` or `?lang=ru`). Planning
 * uses them to skip steps that would only take the visitor where they already
 * are. Empty when the client sent no page.
 */
export function pageFacts(
	page: string | undefined,
	/** The widget's own UI language (and whether the visitor picked it): it wins over the URL's. */
	ui?: { lang?: string; langChosen?: boolean },
): WorldState {
	const parsed = page ? parsePage(page) : undefined;
	const lang = ui?.lang ?? parsed?.lang;
	return {
		...(page && parsed ? { [PAGE_FACT]: page } : {}),
		...(lang ? { [PAGE_LANG_FACT]: lang } : {}),
		...(ui?.lang && ui.langChosen ? { [LANG_CHOSEN_FACT]: true } : {}),
	};
}

/**
 * Starting facts of a new turn: the conversation's own facts (which store the
 * shopper is in) plus this message. Whatever else an earlier run left in the
 * checkpoint is ignored — a run that waits on a browser tool continues through
 * `prepareResume`, never through a new message.
 */
async function initialState(
	deps: ReplyDeps,
	visitor: VisitorRow,
	threadId: string,
	planRunId: string,
	text: string,
	options: ReplyOptions,
): Promise<{
	state: WorldState;
	understood?: Understanding;
	/** The message answers the question a run waited on: that run's goal, to continue it. */
	resumedGoal?: Partial<WorldState>;
}> {
	const userMessage = normalizeText.apply(text);
	const replyTo = options.replyTo ? typedText(options.replyTo) : "";
	const personaLang = deps.personaLang?.(visitor.channelId);
	// Stored now, not when the run ends: a reload mid-run (or a run that never
	// ends) still shows what the visitor said. The reply stores only itself.
	if (deps.history) {
		await deps.history.append(
			{ threadId, userId: visitor.id, planRunId, actionName: "user" },
			[{ role: "user", content: typedText(text) }],
		);
	}
	const context = { threadId, userId: visitor.id, planRunId };
	const catalogLang = deps.catalogLanguage?.(visitor.channelId) ?? "en";
	const checkpoint = await deps.worldStateStore.load(threadId);
	const wait = visitorWaitOf(checkpoint?.state);
	// Models do not know today's date; the visitor's own day beats the server's.
	const today =
		options.clientDate ?? new Date(deps.now()).toISOString().slice(0, 10);
	// One call gives the English text, the tasks and the products; when it fails the message goes on as typed.
	const understood = deps.understandAgent
		? await understandMessage(
				deps.understandAgent,
				decompositionDescriptions(
					deps.taxonomy?.(visitor.channelId) ?? SHOP_TAXONOMY,
				),
				userMessage,
				catalogLang,
				{ ...context, actionName: "alpha-understand" },
				{ replyTo, today, pending: wait },
			)
		: undefined;
	const english = understood?.en;
	const turn: WorldState = {
		userMessage,
		// As typed, only cleaned of control characters: what the history keeps,
		// so a reloaded chat keeps its line breaks (`userMessage` is one line).
		userMessageRaw: typedText(text),
		// What the planner and the small models read; the reply is still about
		// the original. A message with no non-Latin letter is its own English
		// text; absent only when a translation was needed and alpha-understand gave none.
		...(english || !NOT_ENGLISH.test(userMessage)
			? { userMessageEn: english ?? userMessage }
			: {}),
		// The query for the site's search must be in its catalog's language.
		catalogLang,
		// One task: its products are the request, the parse step is not needed.
		...(understood?.tasks.length === 1
			? {
					...itemFacts(understood.tasks[0]?.items),
					...attributeFacts(understood.tasks[0]?.attributes),
				}
			: {}),
		threadId,
		userId: visitor.id,
		// Which channel's persona the reply is written in (`buildActions`).
		channelId: visitor.channelId,
		planRunId,
		...(replyTo ? { [REPLY_TO_FACT]: replyTo } : {}),
		...customerFacts(options.customerContext),
		...pageFacts(options.page, options),
		[TODAY_FACT]: today,
		...(options.timeZone ? { [TIME_ZONE_FACT]: options.timeZone } : {}),
		...(deps.history ? { [USER_STORED_FACT]: true } : {}),
		...(personaLang ? { [PERSONA_LANG_FACT]: personaLang } : {}),
	};
	if (checkpoint && wait && understood?.answersPending) {
		// The same request goes on: its starting facts, plus what the answer adds.
		const { [VISITOR_WAIT_FACT]: _wait, ...asked } = checkpoint.state;
		const english = [asked.userMessageEn, turn.userMessageEn]
			.filter((part) => typeof part === "string" && part)
			.join(". ");
		if (typeof asked.planRunId === "string")
			joinRequest(deps.db, planRunId, asked.planRunId);
		return {
			state: {
				...asked,
				...turn,
				// The request the visitor made stays the one the reply is about.
				userMessage: asked.userMessage ?? turn.userMessage,
				...(english ? { userMessageEn: english } : {}),
				...mergedAttributes(asked, turn),
			},
			understood,
			resumedGoal: checkpoint.goal,
		};
	}
	// Not an answer (or nothing was asked): the old question is dropped with this run's checkpoint.
	return {
		state: checkpoint ? { ...sessionFacts(checkpoint.state), ...turn } : turn,
		understood,
	};
}

/** The question a run waits on, from its checkpoint; `undefined` when none. */
function visitorWaitOf(
	state: WorldState | undefined,
): { request: string; asked: string[] } | undefined {
	const json = state?.[VISITOR_WAIT_FACT];
	if (typeof json !== "string") return undefined;
	try {
		return JSON.parse(json);
	} catch {
		return undefined;
	}
}

/** `statedAttributes` of the waiting request with the answer's on top (same name: the answer wins). */
function mergedAttributes(asked: WorldState, turn: WorldState): WorldState {
	const read = (state: WorldState): UnderstoodAttribute[] => {
		try {
			return JSON.parse(String(state[STATED_ATTRIBUTES] ?? "[]"));
		} catch {
			return [];
		}
	};
	const byName = new Map(
		[...read(asked), ...read(turn)].map((entry) => [entry.name, entry]),
	);
	return byName.size > 0 ? attributeFacts([...byName.values()]) : {};
}

/** `query`/`quantity` (the first product) and, for several, the whole list: what `parseProductRequest` would have written. Quantity 0 stays: it means removal. */
function itemFacts(items: UnderstoodItem[] = []): WorldState {
	const [first] = items;
	if (!first) return {};
	return {
		requestParsed: true,
		query: first.name,
		quantity: first.quantity,
		...(items.length > 1 ? { [REQUESTED_ITEMS]: JSON.stringify(items) } : {}),
	};
}

/** The text as the user typed it: canonical unicode, `\n` line ends, no control characters other than line breaks and tabs. */
export function typedText(text: string): string {
	return text
		.normalize("NFC")
		.replace(/\r\n?/g, "\n")
		.replace(/[^\P{Cc}\n\t]/gu, "")
		.trim();
}

/** Any letter that is not Latin: the message is not (only) English. */
const NOT_ENGLISH = /(?!\p{Script=Latin})\p{L}/u;

/** Who decided the intent, as the ledger names it (shown in the graph). */
const INTENT_PROVIDERS = {
	words: { provider: "rules", model: "message-cues" },
	memory: { provider: "memory", model: "intent-memory" },
	laya: { provider: "laya", model: "gamma-decision" }, // unset decisionModel (tests)
	fallback: { provider: "rules", model: "message-cues" },
} as const;

function reportIntent(
	deps: ReplyDeps,
	verdict: IntentVerdict,
	context: CallContext & CollectedTokens & { latencyMs: number },
): void {
	const { latencyMs, ...call } = context;
	const recorder = deps.usageRecorder?.record
		? { record: deps.usageRecorder.record.bind(deps.usageRecorder) }
		: undefined;
	recordCall(recorder, {
		...call,
		actionName: "classify",
		kind: "classify",
		...INTENT_PROVIDERS[verdict.source],
		...(verdict.source === "laya" ? deps.decisionModel?.() : undefined),
		latencyMs,
		at: deps.now(),
		ok: verdict.source !== "fallback",
		...(verdict.source === "laya" && verdict.confidence !== undefined
			? { confidence: verdict.confidence }
			: {}),
		...(verdict.source === "fallback"
			? { error: "Laya did not answer; decided by words or chat" }
			: {}),
	});
}

/** Plan inputs for a brand-new user message. */
export async function prepareNewMessage(
	deps: ReplyDeps,
	visitor: VisitorRow,
	threadId: string,
	planRunId: string,
	text: string,
	options: ReplyOptions,
): Promise<PreparedRun> {
	const { state, understood, resumedGoal } = await initialState(
		deps,
		visitor,
		threadId,
		planRunId,
		text,
		options,
	);
	const dynamicActions = await resolveDynamicActions(deps, threadId);
	const actions = [...deps.actions, ...dynamicActions];
	// shortcut: only `missingParams` waits for the visitor; `clarifyOptions` and `conflictingTasks` could use the same fact, not built yet.
	if (resumedGoal) {
		return {
			state,
			goal: resumedGoal,
			actions: replyAfterTask(
				preferSpecialist(bindListScope(actions, state), state),
				resumedGoal,
			),
		};
	}

	// No per-thread catalog (the common case): skip classification, a plain
	// "hi" always resolves through `generateReply` without a decision-model call.
	if (dynamicActions.length === 0) {
		return { state, goal: REPLY_GOAL, actions };
	}
	const messageEn =
		typeof state.userMessageEn === "string" ? state.userMessageEn : undefined;
	const original = String(state.userMessage ?? "");
	const taxonomy = deps.taxonomy?.(visitor.channelId) ?? SHOP_TAXONOMY;
	// Several tasks in one message run one after another. shortcut: a channel
	// that picks the site's own tools (no intent sets) is decomposed only when its switch
	// forces it (the tasks then take the shop preset's intents); a tool-level queue is not built yet.
	if (
		messageEn !== undefined &&
		(deps.intentSets?.(visitor.channelId).length !== 0 ||
			deps.severalTasks?.(visitor.channelId) === true) &&
		(understood
			? understood.tasks.length >= 2
			: deps.functionCallAgent && looksLikeSeveralTasks(messageEn))
	) {
		const several = await prepareSeveralTasks(
			deps,
			{ visitor, threadId, planRunId, state, actions, taxonomy },
			messageEn,
			understood?.tasks,
		);
		if (several) return several;
	}
	if (deps.intentSets?.(visitor.channelId).length === 0) {
		const byTool = await prepareByTool(
			deps,
			visitor,
			{ threadId, planRunId, state, actions, dynamicActions },
			{ original, english: messageEn },
		);
		if (byTool) return byTool;
	}
	const startedAt = performance.now();
	const { value: verdict, tokens } = await collectTokens(() =>
		classifyMessageIntentDetailed(
			{
				decisionAgent: deps.decisionAgent,
				taxonomy,
				// A new site has no hand-written words: only checkout and removal are
				// taken from words; the rest comes from what the site has been taught,
				// then from Laya.
				rules: "guarded",
				memory: (text) => deps.intentMemory?.classify(visitor.channelId, text),
			},
			original,
			messageEn,
		),
	);
	const intent = verdict.intent;
	reportIntent(deps, verdict, {
		...tokens,
		threadId,
		userId: visitor.id,
		planRunId,
		latencyMs: Math.round(performance.now() - startedAt),
	});
	// Only what Laya decided is kept for a person to judge: the words are
	// rules, and memory is already what a person approved.
	if (verdict.source === "laya") {
		try {
			const approved = learnIntent(deps.db, {
				channelId: visitor.channelId,
				text: messageEn ?? original,
				intent,
				planRunId,
				now: deps.now(),
				confidence: verdict.confidence,
				autoApproveAt: deps.layaAutoApproveConfidence,
			});
			// The label went straight into the site's memory: rebuild its model.
			if (approved) deps.intentMemory?.invalidate(visitor.channelId);
		} catch (error) {
			deps.onError?.(error);
		}
	}
	return planIntent(state, actions, intent, taxonomy, REPLY_GOAL);
}

/**
 * The plan for one task of a known intent: the usual flow after classification.
 * `baseGoal` is the reply goal, or nothing for a task with more behind it.
 */
function planIntent(
	state: WorldState,
	actions: GoapAction[],
	intent: string,
	taxonomy: Taxonomy,
	baseGoal: Partial<WorldState>,
): PreparedRun {
	// «Now buy them» names nothing: the product the last search found is bought
	// (searched for again: the add tool may need the id from that answer).
	const remembered =
		intent === "addToCart" ? reuseLastProduct(state) : undefined;
	// A message that says one of a tool's own options («… Weeknight Beef Tacos»)
	// asks for that tool: the value is its argument, the search is not needed.
	const withIntent = { ...state, ...remembered, messageIntent: intent };
	const specialist = matchSpecialist(actions, withIntent);
	// «Remove everything»: the list is read first, then each item removed.
	const scope = scopeFacts(withIntent);
	const prepared = { ...withIntent, ...specialist, ...scope };
	const scoped = bindListScope(actions, prepared);
	const goal = goalForIntent(intent, baseGoal, scoped, taxonomy);
	return {
		state: prepared,
		goal,
		actions: replyAfterTask(preferSpecialist(scoped, prepared), goal),
	};
}

/**
 * One task of a queue as an ordinary single-intent run. The tasks behind it
 * are in the state (`taskQueue`), so the run neither replies nor ends the
 * stream; the last task replies, and the reply reads every outcome. Its model
 * reads only the task's own words (`userMessageEn`). The template replies speak
 * of the last task only, so after earlier tasks the text model answers.
 */
function planTask(
	base: WorldState,
	actions: GoapAction[],
	taxonomy: Taxonomy,
	task: QueuedTask,
	queue: QueuedTask[],
	outcomes: ReturnType<typeof readOutcomes>,
): PreparedRun {
	const usable =
		outcomes.length > 0
			? actions.filter(
					(action) =>
						action.name !== TEMPLATE_REPLY_ACTION &&
						action.name !== REMOVAL_REPLY_ACTION,
				)
			: actions;
	return planIntent(
		{
			...base,
			userMessageEn: task.text,
			...itemFacts(task.items),
			...attributeFacts(task.attributes),
			...chainFacts(queue, outcomes),
		},
		usable,
		task.intent,
		taxonomy,
		queue.length > 0 ? {} : REPLY_GOAL,
	);
}

/**
 * Asks delta for the tasks of the message; `undefined` keeps today's single
 * path (no usable answer, one task, or nothing the site can do). Tasks that
 * the words do not confirm or the site cannot do are dropped first
 * (`runnableTasks`); an order the message does not give for tasks that
 * conflict is asked, nothing runs.
 */
async function prepareSeveralTasks(
	deps: ReplyDeps,
	run: {
		visitor: VisitorRow;
		threadId: string;
		planRunId: string;
		state: WorldState;
		actions: GoapAction[];
		taxonomy: Taxonomy;
	},
	messageEn: string,
	/** The tasks `alpha-understand` already gave: no decomposition call. */
	understood?: DecomposedTask[],
): Promise<PreparedRun | undefined> {
	const { visitor, threadId, planRunId, state, actions, taxonomy } = run;
	const found =
		understood ??
		(await decomposeMessage(
			deps.functionCallAgent as NonNullable<ReplyDeps["functionCallAgent"]>,
			decompositionDescriptions(taxonomy),
			messageEn,
			{ threadId, userId: visitor.id, planRunId },
		));
	if (!found || found.length < 2) return undefined;
	const tasks = runnableTasks(found, taxonomy, actions);
	if (tasks.length === 0) return undefined;
	if (mustAskOrder(taxonomy, tasks, messageEn)) {
		return {
			state: {
				...state,
				messageIntent: "chat",
				conflictingTasks: tasks.map((task) => `«${task.text}»`).join(", "),
			},
			goal: REPLY_GOAL,
			actions,
		};
	}
	const [first, ...rest] = tasks.map(
		(task): QueuedTask => ({
			intent: task.intent,
			text: task.text ?? "",
			...(task.items?.length ? { items: task.items } : {}),
			...(task.attributes ? { attributes: task.attributes } : {}),
		}),
	);
	return planTask(
		{ ...state, [TASKS_STARTED_FACT]: deps.now() },
		actions,
		taxonomy,
		first as QueuedTask,
		rest,
		[],
	);
}

/**
 * The run after a finished task of a queue: the site's catalog is read again
 * (a tool may have opened another page, and the widget announces that catalog
 * anew), the facts of the turn and the conversation come along, the rest of
 * the finished run does not.
 */
export async function prepareNextTask(
	deps: ReplyDeps,
	visitor: VisitorRow,
	threadId: string,
	planRunId: string,
	finished: {
		prepared: PreparedRun;
		finalState: WorldState;
		succeeded: boolean;
	},
): Promise<PreparedRun> {
	const [task, ...rest] = readQueue(finished.prepared.state);
	if (!task) throw new Error("no task is queued");
	const outcomes = [
		...readOutcomes(finished.prepared.state),
		outcomeOf(
			finished.prepared.state,
			finished.finalState,
			// A goal that shrank to the reply alone (the catalog changed) did nothing.
			finished.succeeded &&
				Object.keys(finished.prepared.goal).some((key) => !(key in REPLY_GOAL)),
			lastToolAnswer(finished.finalState),
		),
	];
	const dynamicActions = await resolveDynamicActions(deps, threadId);
	const taxonomy = deps.taxonomy?.(visitor.channelId) ?? SHOP_TAXONOMY;
	const base = {
		...turnFacts(finished.finalState),
		...sessionFacts(finished.finalState),
		planRunId,
	};
	return planTask(
		base,
		[...deps.actions, ...dynamicActions],
		taxonomy,
		task,
		rest,
		outcomes,
	);
}

/** Longest list of the site's actions handed to the reply model when it has to ask what the visitor means. */
const CLARIFY_TOOLS = 12;

/**
 * A channel without intent sets: the message picks one of the site's own tools
 * and that tool's result is the goal; the tool's preconditions still come from
 * its (shop-taxonomy) intent, so a search precedes an id-based add. `undefined`
 * when the words of checkout/removal decide: those keep the guarded intent flow.
 */
async function prepareByTool(
	deps: ReplyDeps,
	visitor: VisitorRow,
	run: {
		threadId: string;
		planRunId: string;
		state: WorldState;
		actions: GoapAction[];
		dynamicActions: GoapAction[];
	},
	message: { original: string; english?: string },
): Promise<PreparedRun | undefined> {
	const taxonomy = deps.taxonomy?.(visitor.channelId) ?? SHOP_TAXONOMY;
	const words =
		intentFromMessageCues(taxonomy, message.original) ??
		(message.english
			? intentFromMessageCues(taxonomy, message.english)
			: undefined);
	if (words && needsTheWords(taxonomy).has(words)) return undefined;

	// A message that buys one of a tool's own options («add the Gym Starter kit») asks for that
	// tool; a tool binds only to the intent it was classified with, and buying is the one
	// whose words are rules.
	const specialist =
		words === "addToCart"
			? matchSpecialist(run.dynamicActions, {
					...run.state,
					messageIntent: "addToCart",
				})
			: undefined;
	if (typeof specialist?.specialistTool === "string") {
		const state = { ...run.state, ...specialist, messageIntent: "other" };
		const goal = {
			...REPLY_GOAL,
			[`toolResult:${specialist.specialistTool}`]: true,
		};
		return {
			state,
			goal,
			actions: replyAfterTask(preferSpecialist(run.actions, state), goal),
		};
	}
	// Only the site's tools: the catalog also holds helper steps (`choose:<tool>.<parameter>`).
	const tools = run.dynamicActions
		.filter((action) => action.effects[`toolResult:${action.name}`] === true)
		.map((action) => ({
			name: action.name,
			description: action.description,
			effects: action.effects,
		}));
	const startedAt = performance.now();
	const { value: choice, tokens } = await collectTokens(() =>
		chooseTool(
			{ decisionAgent: deps.decisionAgent, tools, taxonomy, intent: words },
			message.english ?? message.original,
		),
	);
	reportIntent(
		deps,
		{
			intent: choice.kind === "tool" ? "other" : "chat",
			source:
				choice.kind === "tool" && choice.via === "words" ? "words" : "laya",
			confidence: choice.confidence,
		},
		{
			...tokens,
			threadId: run.threadId,
			userId: visitor.id,
			planRunId: run.planRunId,
			latencyMs: Math.round(performance.now() - startedAt),
		},
	);
	if (choice.kind === "tool") {
		const goal = { ...REPLY_GOAL, [`toolResult:${choice.tool}`]: true };
		return {
			state: { ...run.state, messageIntent: "other" },
			goal,
			actions: replyAfterTask(run.actions, goal),
		};
	}
	const clarify =
		choice.kind === "unclear"
			? {
					clarifyOptions: tools
						.slice(0, CLARIFY_TOOLS)
						.map(
							(tool) =>
								`${tool.name}${tool.description ? ` (${tool.description.split(/(?<=[.!?])\s/)[0]})` : ""}`,
						)
						.join("; "),
				}
			: {};
	return {
		state: { ...run.state, messageIntent: "chat", ...clarify },
		goal: REPLY_GOAL,
		actions: run.actions,
	};
}

/** The state without the awaited-tool marker: the answer it waited for has arrived. */
function withoutAwaited(state: WorldState): WorldState {
	const {
		[AWAITED_TOOL_FACT]: _awaited,
		[AWAITED_ARGS_FACT]: _args,
		...rest
	} = state;
	return rest;
}

/** The state without the page facts (they are replaced, never merged: a missing language must not survive). */
function withoutPage(state: WorldState): WorldState {
	const {
		[PAGE_FACT]: _path,
		[PAGE_LANG_FACT]: _lang,
		[LANG_CHOSEN_FACT]: _chosen,
		...rest
	} = state;
	return rest;
}

/**
 * The reply should report what was done, so it must come after the task: its
 * preconditions become the task's own goal facts (`inCart` for "buy cheese").
 * Without this the planner may put the reply first and answer before anything
 * happened.
 */
export function replyAfterTask(
	actions: GoapAction[],
	goal: Partial<WorldState>,
): GoapAction[] {
	const taskFacts = Object.fromEntries(
		Object.entries(goal).filter(([key]) => !(key in REPLY_GOAL)),
	);
	if (Object.keys(taskFacts).length === 0) return actions;
	return actions.map((action) =>
		action.name === REPLY_ACTION
			? { ...action, preconditions: { ...action.preconditions, ...taskFacts } }
			: action,
	);
}

/** Text of a tool's answer: MCP `{content:[{text}]}`, a plain string, or JSON as a last resort. Capped. */
export function toolResultText(result: unknown): string {
	const text = (() => {
		if (typeof result === "string") return result;
		const content = (result as { content?: unknown } | null)?.content;
		if (Array.isArray(content)) {
			return content
				.map((part) => (part as { text?: unknown })?.text)
				.filter((part): part is string => typeof part === "string")
				.map((part) => part.slice(0, MAX_TOOL_TEXT_CHARS))
				.join("\n");
		}
		return result === undefined ? "" : boundedJson(result);
	})();
	return text.slice(0, MAX_TOOL_TEXT_CHARS);
}

/**
 * `JSON.stringify` that stops building output once `MAX_TOOL_TEXT_CHARS` of
 * strings have gone by: the rest is replaced by `undefined` (omitted), so a
 * huge client-supplied value is not serialized in full just to be cut.
 */
function boundedJson(value: unknown): string {
	let budget = MAX_TOOL_TEXT_CHARS;
	return (
		JSON.stringify(value, (key, item) => {
			if (budget <= 0) return undefined;
			budget -= key.length;
			if (typeof item === "string") {
				budget -= item.length;
				return item.slice(0, Math.max(budget + item.length, 0));
			}
			return item;
		}) ?? ""
	);
}

/** The checkpoint a tool result answers; throws (in-band error) for a stale or foreign one. */
async function awaitedCheckpoint(
	deps: ReplyDeps,
	threadId: string,
	toolResult: ToolOutcome,
) {
	const checkpoint = await deps.worldStateStore.load(threadId);
	if (!checkpoint) {
		// Stale or bogus resume (expired checkpoint, thread that never waited).
		// Reported in-band like any other failed run — the stream has started.
		throw new Error("nothing to resume for this thread");
	}
	// Only the answer to the call this checkpoint is waiting on: the callId is
	// the id of the run that issued it, `awaitedTool` the tool it named. A
	// result is consumed once — the checkpoint is replaced when the run ends.
	if (
		checkpoint.state[AWAITED_TOOL_FACT] === undefined ||
		toolResult.callId !== checkpoint.state.planRunId ||
		toolResult.tool !== checkpoint.state[AWAITED_TOOL_FACT]
	) {
		throw new Error("unexpected tool result for this thread");
	}
	return checkpoint;
}

/**
 * The visitor gave up on the call the run waits on. The tool may have run
 * already, so nothing is claimed either way: the request ends as `cancelled`
 * (a run row with a `cancelled` trace event, for /flow), the rest of the task
 * queue goes with the checkpoint, and the conversation keeps its own facts.
 */
export async function cancelWait(
	deps: ReplyDeps,
	visitor: VisitorRow,
	threadId: string,
	toolResult: ToolOutcome,
): Promise<void> {
	const checkpoint = await awaitedCheckpoint(deps, threadId, toolResult);
	const id = crypto.randomUUID();
	const at = deps.now();
	startPlanRun(deps.db, {
		id,
		visitorId: visitor.id,
		threadId,
		goal: {},
		createdAt: at,
	});
	joinRequest(deps.db, id, String(checkpoint.state.planRunId));
	finishPlanRun(deps.db, id, {
		succeeded: false,
		durationMs: 1,
		events: [{ type: "cancelled", at }],
	});
	const session = sessionFacts(checkpoint.state);
	if (Object.keys(session).length > 0)
		await deps.worldStateStore.save(threadId, { state: session, goal: {} });
	else await deps.worldStateStore.clear(threadId);
}

/**
 * Plan inputs for resuming a run that stopped on a browser-side WebMCP tool:
 * the exact checkpointed state and goal, plus the tool's outcome as
 * `webmcp:<tool>:result` (read back by the action that asked to wait).
 */
export async function prepareResume(
	deps: ReplyDeps,
	threadId: string,
	planRunId: string,
	toolResult: ToolOutcome,
): Promise<PreparedRun> {
	const checkpoint = await awaitedCheckpoint(deps, threadId, toolResult);
	// The checkpoint still names the run that stopped to wait: this one
	// continues its request.
	if (typeof checkpoint.state.planRunId === "string") {
		joinRequest(deps.db, planRunId, checkpoint.state.planRunId);
	}
	const dynamicActions = await resolveDynamicActions(deps, threadId);
	return {
		state: {
			...withoutAwaited(withoutPage(checkpoint.state)),
			// Where the visitor is now — the tool may have navigated.
			...pageFacts(toolResult.page, toolResult),
			// The resumed run is its own `plan_runs` row; usage made by what runs
			// next (e.g. `generateReply`) links to it, not to the run that waited.
			planRunId,
			[`webmcp:${toolResult.tool}:result`]: toolResult.isError ? "error" : "ok",
			// What the tool answered (e.g. the search hits): the next step reads
			// it, for instance to pick the first product to add.
			[`webmcp:${toolResult.tool}:text`]: toolResultText(toolResult.result),
		},
		goal: checkpoint.goal,
		// The checkpoint keeps the facts of a named tool (`specialistTool`), so
		// the resumed plan still prefers it.
		actions: replyAfterTask(
			preferSpecialist(
				bindListScope([...deps.actions, ...dynamicActions], checkpoint.state),
				checkpoint.state,
			),
			checkpoint.goal,
		),
	};
}
