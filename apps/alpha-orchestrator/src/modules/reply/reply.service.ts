import type { GoapAction, WorldState } from "@repo/core";
import { classifyMessageIntent, goalForIntent } from "@repo/core";
import { customerFacts, REPLY_GOAL } from "../goap/goap.service.ts";
import type { PreparedRun } from "../run-stream/run-stream.types.ts";
import { normalizeText } from "../text/text.service.ts";
import type { UserRow } from "../users/users.types.ts";
import type { CustomerContext } from "../widget/widget.types.ts";
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

/** Starting facts of a new turn. They win over facts an earlier unfinished run left behind. */
async function initialState(
	deps: ReplyDeps,
	user: UserRow,
	threadId: string,
	planRunId: string,
	text: string,
	customerContext: CustomerContext | undefined,
): Promise<WorldState> {
	const turn: WorldState = {
		userMessage: normalizeText.apply(text),
		threadId,
		userId: user.id,
		planRunId,
		...customerFacts(customerContext),
	};
	const checkpoint = await deps.worldStateStore.load(threadId);
	return checkpoint ? { ...checkpoint.state, ...turn } : turn;
}

/** Plan inputs for a brand-new user message. */
export async function prepareNewMessage(
	deps: ReplyDeps,
	user: UserRow,
	threadId: string,
	planRunId: string,
	text: string,
	customerContext: CustomerContext | undefined,
): Promise<PreparedRun> {
	const state = await initialState(
		deps,
		user,
		threadId,
		planRunId,
		text,
		customerContext,
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
	);
	return {
		state: { ...state, messageIntent: intent },
		goal: goalForIntent(intent, REPLY_GOAL, actions),
		actions,
	};
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
	toolResult: { tool: string; isError: boolean },
): Promise<PreparedRun> {
	const checkpoint = await deps.worldStateStore.load(threadId);
	if (!checkpoint) {
		// Stale or bogus resume (expired checkpoint, thread that never waited).
		// Reported in-band like any other failed run — the stream has started.
		throw new Error("nothing to resume for this thread");
	}
	const dynamicActions = await resolveDynamicActions(deps, threadId);
	return {
		state: {
			...checkpoint.state,
			// The resumed run is its own `plan_runs` row; usage made by what runs
			// next (e.g. `generateReply`) links to it, not to the run that waited.
			planRunId,
			[`webmcp:${toolResult.tool}:result`]: toolResult.isError ? "error" : "ok",
		},
		goal: checkpoint.goal,
		actions: [...deps.actions, ...dynamicActions],
	};
}
