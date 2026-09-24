/**
 * Flat key-value fact bag — not a graph, not a strict schema. Actions
 * document which keys they read/write; see docs/harness-goap-orchestrator-plan.md.
 */
export type WorldState = Record<string, boolean | number | string | undefined>;

/** Target subset of facts the planner tries to reach. */
export type Goal = Partial<WorldState>;

/**
 * Caller-supplied context threaded through a `runPlan` call, extended by
 * real callers for what actions need (thread id, fetch client, ...).
 * Deliberately excludes `state`: the caller only has the state a run
 * *starts* with, not what's true partway through — the executor injects
 * that itself, per action (see `ActionContext`).
 */
export type BaseContext = Record<string, unknown>;

/**
 * What an action's `execute()` actually receives: `BaseContext` plus the
 * live `state` as of the moment this specific action runs — reflects any
 * earlier actions' real effects from this same run, not just what was true
 * when planning started. `plan()` itself never touches this; only
 * preconditions/effects/cost matter to it.
 */
export interface ActionContext extends BaseContext {
	state: WorldState;
}

export interface GoapAction {
	name: string;
	/** Real resource cost (calibrated latency/CPU), not an arbitrary number — see the plan doc. */
	cost: number;
	preconditions: Partial<WorldState>;
	/** Expected effects — what this action is *supposed* to produce. */
	effects: Partial<WorldState>;
	/** Actual effects observed — may differ (tool error, model refusal, ...); the executor (Phase 2) reconciles this. */
	execute(ctx: ActionContext): Promise<Partial<WorldState>>;
}

/**
 * Emitted by `runPlan` through `RunPlanOptions.tracer`. Pure data — the
 * caller decides whether to buffer/persist it.
 */
export type PlanTraceEvent =
	| {
			type: "planned";
			attempt: number;
			plan: { name: string; cost: number }[];
			totalCost: number;
			state: WorldState;
			at: number;
	  }
	| { type: "no_plan"; attempt: number; state: WorldState; at: number }
	| {
			type: "action_skipped";
			attempt: number;
			action: string;
			unmetPreconditions: Partial<WorldState>;
			at: number;
	  }
	| { type: "action_started"; attempt: number; action: string; at: number }
	| {
			type: "action_finished";
			attempt: number;
			action: string;
			durationMs: number;
			expectedEffects: Partial<WorldState>;
			observedEffects: Partial<WorldState>;
			at: number;
	  }
	| {
			type: "action_failed";
			attempt: number;
			action: string;
			durationMs: number;
			error: string;
			at: number;
	  }
	/** `attempt` is the attempt that just ended short of the goal; the next `planned` carries `attempt + 1`. */
	| { type: "replan"; attempt: number; state: WorldState; at: number }
	| {
			type: "finished";
			succeeded: boolean;
			attempts: number;
			durationMs: number;
			at: number;
	  };

export type PlanTracer = (event: PlanTraceEvent) => void;
