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
	/** Set when the run was given one via `RunPlanOptions.signal` — a long-running action should abort its own work when this fires. */
	signal?: AbortSignal;
}

/**
 * What an action asks for when it needs something only the run's caller can
 * supply — e.g. a WebMCP tool call, which can only execute in the visitor's
 * browser, never on the server (see docs/laya-autonomous-webmcp.md). `kind`
 * and `payload` are opaque to the executor: it only stops the run and
 * reports this back, the caller decides what to do with it.
 */
export interface WaitingOn {
	kind: string;
	payload: unknown;
}

/** Either the real/expected effects, or a request to pause the run (see `WaitingOn`). */
export type ActionResult = Partial<WorldState> | { waiting: WaitingOn };

/** Where an action is, for the user-facing progress text (see `GoapAction.describe`). */
export type StepPhase = "running" | "done" | "failed";

/** One line of progress shown to the user: what is happening now, in their language. */
export interface PlanStep {
	action: string;
	phase: StepPhase;
	text: string;
}

export interface GoapAction {
	name: string;
	/** Real resource cost (calibrated latency/CPU), not an arbitrary number — see the plan doc. */
	cost: number;
	preconditions: Partial<WorldState>;
	/** Expected effects — what this action is *supposed* to produce. */
	effects: Partial<WorldState>;
	/** Actual effects observed — may differ (tool error, model refusal, ...); the executor (Phase 2) reconciles this. Or a `{ waiting }` request to pause the run (Phase 6/WebMCP). */
	execute(ctx: ActionContext): Promise<ActionResult>;
	/**
	 * What to tell the user about this action ("Ищу «cheese»…"), or `undefined`
	 * to stay silent. Called with the state before the action for `running` and
	 * with the state after it for `done`/`failed`, so it can quote what the
	 * action found. Text is user-facing, not a log line.
	 */
	describe?(state: WorldState, phase: StepPhase): string | undefined;
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
	/** An action can't complete on the server — see `WaitingOn` — so the run stops here; the caller persists state and resumes later. */
	| {
			type: "waiting";
			attempt: number;
			action: string;
			waiting: WaitingOn;
			state: WorldState;
			at: number;
	  }
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
	/** `RunPlanOptions.signal` fired — before planning, or between two actions of the current plan. */
	| { type: "killed"; attempt: number; state: WorldState; at: number }
	| {
			type: "finished";
			succeeded: boolean;
			attempts: number;
			durationMs: number;
			at: number;
	  };

export type PlanTracer = (event: PlanTraceEvent) => void;
