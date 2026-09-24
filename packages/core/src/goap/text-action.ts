import type { Agent } from "../types";
import type { ActionContext, GoapAction, WorldState } from "./types";

export interface TextActionMeta {
	elapsedMs: number;
	inputTokens?: number;
	outputTokens?: number;
	/** Across every model call behind this reply (ingest passes + final generation) — see `AgentStreamEvent`'s `done`. */
	totalInputTokens?: number;
	totalOutputTokens?: number;
}

export interface TextActionConfig {
	name: string;
	cost: number;
	preconditions: Partial<WorldState>;
	/** Planner-time promise — see the matching field on `DecisionActionConfig` for why this is separate from `toEffects`. */
	effects: Partial<WorldState>;
	agent: Agent;
	/** Builds the chunks to send from the live world state (e.g. the user's message, already normalized upstream). */
	toChunks: (state: WorldState) => string[];
	threadId: (state: WorldState) => string;
	userId: (state: WorldState) => string;
	/** Maps the generated reply text, plus the underlying agent call's own timing/usage, into observed world-state facts. */
	toEffects: (replyText: string, meta: TextActionMeta) => Partial<WorldState>;
}

/**
 * Optional per-run extension a caller adds to `BaseContext` (not part of the
 * core `ActionContext` shape) to receive generated text as it streams,
 * instead of only the joined result `toEffects` gets once `execute()`
 * resolves — a `GoapAction`'s `execute()` returns one `Promise`, not a
 * stream, so this is the only way anything outside stays "blazing"
 * (live token output) through the planner instead of waiting for the whole
 * plan to finish.
 */
export interface StreamingContext {
	onDelta?: (text: string) => void;
}

/**
 * Wraps the existing `Agent` port (`packages/core/src/agent.ts`, unchanged)
 * into a `GoapAction` — an albedo-action per the plan doc.
 */
export function createTextAction(config: TextActionConfig): GoapAction {
	return {
		name: config.name,
		cost: config.cost,
		preconditions: config.preconditions,
		effects: config.effects,
		async execute(ctx: ActionContext) {
			const { state } = ctx;
			const onDelta = (ctx as ActionContext & StreamingContext).onDelta;

			let replyText = "";
			let meta: TextActionMeta = { elapsedMs: 0 };

			for await (const event of config.agent.handleMessageStream({
				threadId: config.threadId(state),
				userId: config.userId(state),
				planRunId:
					typeof state.planRunId === "string" ? state.planRunId : undefined,
				actionName: config.name,
				chunks: config.toChunks(state),
			})) {
				if (event.type === "delta") {
					replyText += event.text;
					onDelta?.(event.text);
				} else if (event.type === "done") {
					meta = {
						elapsedMs: event.elapsedMs,
						inputTokens: event.inputTokens,
						outputTokens: event.outputTokens,
						totalInputTokens: event.totalInputTokens,
						totalOutputTokens: event.totalOutputTokens,
					};
				}
			}

			return config.toEffects(replyText, meta);
		},
	};
}
