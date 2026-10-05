import type { CallContext, GoapAction, WorldState } from "@repo/core";
import {
	classifyMessageIntent,
	goalForIntent,
	MAX_TOOL_TEXT_CHARS,
	PAGE_FACT,
	PAGE_LANG_FACT,
	parsePage,
	recordCall,
} from "@repo/core";
import {
	customerFacts,
	REPLY_ACTION,
	REPLY_GOAL,
} from "../goap/goap.service.ts";
import { joinRequest } from "../plan-runs/plan-runs.service.ts";
import { sessionFacts } from "../run-stream/run-stream.ts";
import type { PreparedRun } from "../run-stream/run-stream.types.ts";
import { normalizeText } from "../text/text.service.ts";
import type { UserRow } from "../users/users.types.ts";
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
export function pageFacts(page: string | undefined): WorldState {
	const parsed = page ? parsePage(page) : undefined;
	if (!page || !parsed) return {};
	return {
		[PAGE_FACT]: page,
		...(parsed.lang ? { [PAGE_LANG_FACT]: parsed.lang } : {}),
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
	user: UserRow,
	threadId: string,
	planRunId: string,
	text: string,
	options: ReplyOptions,
): Promise<WorldState> {
	const userMessage = normalizeText.apply(text);
	const english = translateMessage(deps, userMessage, {
		threadId,
		userId: user.id,
		planRunId,
	});
	const turn: WorldState = {
		userMessage,
		// What the planner and the small models read; the reply is still about
		// the original. Absent for a message that needed no translation.
		...(english ? { userMessageEn: english } : {}),
		// The query for the site's search must be in its catalog's language.
		catalogLang: deps.catalogLanguage?.(user.channelId) ?? "en",
		threadId,
		userId: user.id,
		planRunId,
		...customerFacts(options.customerContext),
		...pageFacts(options.page),
	};
	const checkpoint = await deps.worldStateStore.load(threadId);
	return checkpoint ? { ...sessionFacts(checkpoint.state), ...turn } : turn;
}

/** Shown next to the call in the ledger and the graph (the files `translate-engine.ts` downloads). */
const TRANSLATE_MODEL = "opus-mt-ru-en";

/** Any letter that is not Latin: the message is not (only) English. */
const NOT_ENGLISH = /(?!\p{Script=Latin})\p{L}/u;

/**
 * The message in English, the first thing done with it: Laya and the small
 * models read English far better than Russian. `undefined` when it already is
 * English, when there is no translator, or when the translator fails (reported,
 * never fatal — the message just goes on in its own language).
 */
function translateMessage(
	deps: ReplyDeps,
	text: string,
	context: CallContext,
): string | undefined {
	if (!deps.translate || !NOT_ENGLISH.test(text)) return undefined;
	const startedAt = performance.now();
	const recorder = deps.usageRecorder?.record
		? { record: deps.usageRecorder.record.bind(deps.usageRecorder) }
		: undefined;
	const report = (outcome: { ok: true } | { ok: false; error: string }) =>
		recordCall(recorder, {
			...context,
			actionName: "translate",
			kind: "translate",
			provider: "ctranslate2",
			model: TRANSLATE_MODEL,
			latencyMs: Math.round(performance.now() - startedAt),
			at: deps.now(),
			...outcome,
		});
	try {
		const translated = deps.translate(text) || undefined;
		report({ ok: true });
		return translated;
	} catch (error) {
		report({
			ok: false,
			error: error instanceof Error ? error.message : String(error),
		});
		deps.onError?.(error);
		return undefined;
	}
}

/** Plan inputs for a brand-new user message. */
export async function prepareNewMessage(
	deps: ReplyDeps,
	user: UserRow,
	threadId: string,
	planRunId: string,
	text: string,
	options: ReplyOptions,
): Promise<PreparedRun> {
	const state = await initialState(
		deps,
		user,
		threadId,
		planRunId,
		text,
		options,
	);
	const dynamicActions = await resolveDynamicActions(deps, threadId);
	const actions = [...deps.actions, ...dynamicActions];

	// No per-thread catalog (the common case): skip classification, a plain
	// "hi" always resolves through `generateReply` without a decision-model call.
	if (dynamicActions.length === 0) {
		return { state, goal: REPLY_GOAL, actions };
	}
	const intent = await classifyMessageIntent(
		{ decisionAgent: deps.decisionAgent },
		String(state.userMessage ?? ""),
		typeof state.userMessageEn === "string" ? state.userMessageEn : undefined,
	);
	const goal = goalForIntent(intent, REPLY_GOAL, actions);
	return {
		state: { ...state, messageIntent: intent },
		goal,
		actions: replyAfterTask(actions, goal),
	};
}

/** The state without the page facts (they are replaced, never merged: a missing language must not survive). */
function withoutPage(state: WorldState): WorldState {
	const { [PAGE_FACT]: _path, [PAGE_LANG_FACT]: _lang, ...rest } = state;
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
				.join("\n");
		}
		return result === undefined ? "" : JSON.stringify(result);
	})();
	return text.slice(0, MAX_TOOL_TEXT_CHARS);
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
	const checkpoint = await deps.worldStateStore.load(threadId);
	if (!checkpoint) {
		// Stale or bogus resume (expired checkpoint, thread that never waited).
		// Reported in-band like any other failed run — the stream has started.
		throw new Error("nothing to resume for this thread");
	}
	// The checkpoint still names the run that stopped to wait: this one
	// continues its request.
	if (typeof checkpoint.state.planRunId === "string") {
		joinRequest(deps.db, planRunId, checkpoint.state.planRunId);
	}
	const dynamicActions = await resolveDynamicActions(deps, threadId);
	return {
		state: {
			...withoutPage(checkpoint.state),
			// Where the visitor is now — the tool may have navigated.
			...pageFacts(toolResult.page),
			// The resumed run is its own `plan_runs` row; usage made by what runs
			// next (e.g. `generateReply`) links to it, not to the run that waited.
			planRunId,
			[`webmcp:${toolResult.tool}:result`]: toolResult.isError ? "error" : "ok",
			// What the tool answered (e.g. the search hits): the next step reads
			// it, for instance to pick the first product to add.
			[`webmcp:${toolResult.tool}:text`]: toolResultText(toolResult.result),
		},
		goal: checkpoint.goal,
		actions: replyAfterTask(
			[...deps.actions, ...dynamicActions],
			checkpoint.goal,
		),
	};
}
