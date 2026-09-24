import type {
	DecisionAgent,
	DecisionAnswer,
	DecisionQuestion,
} from "../decision-types";
import type { UsageRecorder } from "../types";
import type { ActionContext, GoapAction, WorldState } from "./types";

export interface DecisionActionConfig {
	name: string;
	cost: number;
	preconditions: Partial<WorldState>;
	/** Planner-time promise — what this action is expected to produce. Real execution may land on a different value for the same key (that's what the replanning executor is for), which is why this is a separate field from `toEffects` below, not derived from it. */
	effects: Partial<WorldState>;
	decisionAgent: DecisionAgent;
	/** The single typed question this action asks Laya. */
	question: DecisionQuestion;
	/** Builds the `state` payload `decide()` needs from the live world state at execution time. */
	toDecisionState: (state: WorldState) => unknown;
	/** Maps Laya's real answer into observed world-state facts. */
	toEffects: (answer: DecisionAnswer) => Partial<WorldState>;
	/** Optional: records each `decide()` call as a `kind: "decision"` usage row (latency only — Laya has no tokens). */
	usageRecorder?: UsageRecorder;
	/** Who the recorded call belongs to — only read when `usageRecorder` is set. */
	threadId?: (state: WorldState) => string;
	userId?: (state: WorldState) => string;
}

/**
 * Wraps the existing `DecisionAgent` port (`packages/core/src/decision-agent.ts`,
 * unchanged) into a `GoapAction` — a Laya-action per the plan doc. One
 * config = one fixed typed question, keyed by the action's own `name` in
 * the `decide()` call so a `runPlan` that happens to use several decision
 * actions never has their questions collide.
 */
export function createDecisionAction(config: DecisionActionConfig): GoapAction {
	return {
		name: config.name,
		cost: config.cost,
		preconditions: config.preconditions,
		effects: config.effects,
		async execute(ctx: ActionContext) {
			const { state } = ctx;
			const startedAt = Date.now();
			const record = (outcome: { ok: true } | { ok: false; error: string }) =>
				config.usageRecorder?.record({
					threadId: config.threadId?.(state) ?? "",
					userId: config.userId?.(state) ?? "",
					planRunId:
						typeof state.planRunId === "string" ? state.planRunId : undefined,
					actionName: config.name,
					kind: "decision",
					provider: "laya",
					model: "laya-system-one",
					latencyMs: Date.now() - startedAt,
					at: Date.now(),
					...outcome,
				});

			let answers: Record<string, DecisionAnswer>;
			try {
				answers = await config.decisionAgent.decide(
					config.toDecisionState(state),
					{ [config.name]: config.question },
				);
			} catch (error) {
				record({
					ok: false,
					error: error instanceof Error ? error.message : String(error),
				});
				throw error;
			}
			record({ ok: true });

			const answer = answers[config.name];
			return answer ? config.toEffects(answer) : {};
		},
	};
}
