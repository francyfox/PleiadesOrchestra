import { plan } from "./plan";
import type {
	BaseContext,
	Goal,
	GoapAction,
	PlanTraceEvent,
	PlanTracer,
	WorldState,
} from "./types";

export interface RunPlanOptions {
	state: WorldState;
	goal: Goal;
	actions: GoapAction[];
	ctx: BaseContext;
	/** Cap on replanning attempts beyond the first — guards against a runaway loop eating CPU on one request. */
	maxReplans?: number;
	/** Receives planning/execution events (see `PlanTraceEvent`). Must not throw. */
	tracer?: PlanTracer;
}

export interface RunPlanResult {
	finalState: WorldState;
	/** Names of actions actually run, in execution order — includes repeats across replans. */
	executedActions: string[];
	succeeded: boolean;
}

function satisfied(
	conditions: Partial<WorldState>,
	state: WorldState,
): boolean {
	return Object.entries(conditions).every(
		([key, value]) => state[key] === value,
	);
}

/** The subset of `conditions` not currently true in `state`. */
function unmet(
	conditions: Partial<WorldState>,
	state: WorldState,
): Partial<WorldState> {
	return Object.fromEntries(
		Object.entries(conditions).filter(([key, value]) => state[key] !== value),
	);
}

/** Per-`runPlan` bookkeeping shared across (re)plan attempts. */
interface Run {
	goal: Goal;
	actions: GoapAction[];
	ctx: BaseContext;
	executedActions: string[];
	/** Attempts started so far — also the next attempt's 0-based index. */
	attempts: number;
	/** Distributive, so each `PlanTraceEvent` variant keeps its own fields. */
	emit: (event: DistributiveOmit<PlanTraceEvent, "at">) => void;
}

type DistributiveOmit<T, K extends PropertyKey> = T extends unknown
	? Omit<T, K>
	: never;

/**
 * One (re)plan-and-execute attempt: plans from `state` toward `goal`,
 * executes actions in order, and either returns (goal met, or no plan
 * exists) or recurses with one fewer `replansLeft`. Recursion depth is the
 * bound itself, visible in the signature, rather than a counter buried in a
 * loop body — safe because `replansLeft` starts small by design (see
 * `RunPlanOptions.maxReplans`'s doc), so this never gets close to a stack
 * limit.
 */
async function attempt(
	run: Run,
	state: WorldState,
	replansLeft: number,
): Promise<RunPlanResult> {
	const { goal, actions, ctx, executedActions, emit } = run;
	const attemptIndex = run.attempts++;

	const currentPlan = plan(state, goal, actions);
	if (!currentPlan) {
		emit({ type: "no_plan", attempt: attemptIndex, state });
		return { finalState: state, executedActions, succeeded: false };
	}
	emit({
		type: "planned",
		attempt: attemptIndex,
		plan: currentPlan.map(({ name, cost }) => ({ name, cost })),
		totalCost: currentPlan.reduce((sum, { cost }) => sum + cost, 0),
		state,
	});

	let nextState = state;
	for (const action of currentPlan) {
		if (!satisfied(action.preconditions, nextState)) {
			emit({
				type: "action_skipped",
				attempt: attemptIndex,
				action: action.name,
				unmetPreconditions: unmet(action.preconditions, nextState),
			});
			break;
		}

		emit({
			type: "action_started",
			attempt: attemptIndex,
			action: action.name,
		});
		const actionStartedAt = Date.now();
		let observedEffects: Partial<WorldState>;
		try {
			// Live state as of this specific action, not just what was true when
			// this attempt started — an earlier action's real effects in this same
			// loop are already reflected here.
			observedEffects = await action.execute({ ...ctx, state: nextState });
		} catch (error) {
			emit({
				type: "action_failed",
				attempt: attemptIndex,
				action: action.name,
				durationMs: Date.now() - actionStartedAt,
				error: error instanceof Error ? error.message : String(error),
			});
			throw error;
		}
		emit({
			type: "action_finished",
			attempt: attemptIndex,
			action: action.name,
			durationMs: Date.now() - actionStartedAt,
			expectedEffects: action.effects,
			observedEffects,
		});
		nextState = { ...nextState, ...observedEffects };
		executedActions.push(action.name);
	}

	if (satisfied(goal, nextState)) {
		return { finalState: nextState, executedActions, succeeded: true };
	}
	if (replansLeft <= 0) {
		return { finalState: nextState, executedActions, succeeded: false };
	}

	emit({ type: "replan", attempt: attemptIndex, state: nextState });
	return attempt(run, nextState, replansLeft - 1);
}

/**
 * Runs a GOAP plan with replanning: (re)plans from the current state toward
 * `goal`, executes actions in order, and — since `execute()`'s real effects
 * can diverge from an action's declared `effects` (a flaky tool, a model
 * that didn't do what it claimed) — replans from wherever execution actually
 * left off whenever the goal isn't yet satisfied, instead of assuming the
 * planned sequence played out as expected. Bounded by `maxReplans` so a
 * situation that never converges doesn't recurse forever.
 *
 * With a `tracer`, every planning/execution step is reported as a
 * `PlanTraceEvent`, always ending in exactly one `finished` — including when
 * an action throws (the error is still rethrown afterwards).
 */
export async function runPlan(options: RunPlanOptions): Promise<RunPlanResult> {
	const { state, goal, actions, ctx, maxReplans = 10, tracer } = options;
	const startedAt = Date.now();
	const run: Run = {
		goal,
		actions,
		ctx,
		executedActions: [],
		attempts: 0,
		emit: (event) => {
			if (!tracer) return;
			// Tracing is observability — a buggy tracer must never change the run.
			try {
				tracer({ ...event, at: Date.now() } as PlanTraceEvent);
			} catch {}
		},
	};
	const finish = (succeeded: boolean) =>
		run.emit({
			type: "finished",
			succeeded,
			attempts: run.attempts,
			durationMs: Date.now() - startedAt,
		});

	try {
		const result = await attempt(run, state, maxReplans);
		finish(result.succeeded);
		return result;
	} catch (error) {
		finish(false);
		throw error;
	}
}
