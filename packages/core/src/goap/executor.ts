import { plan } from "./plan";
import type {
	BaseContext,
	Goal,
	GoapAction,
	PlanStep,
	PlanTraceEvent,
	PlanTracer,
	StepPhase,
	WaitingOn,
	WorldState,
} from "./types";

export interface RunPlanOptions {
	state: WorldState;
	goal: Goal;
	actions: GoapAction[];
	ctx: BaseContext;
	/** Cap on replanning attempts beyond the first — guards against a runaway loop eating CPU on one request. */
	maxReplans?: number;
	/**
	 * Gives up once the same action has finished this many times in a run
	 * without producing the effects it promised. Off by default. Without it, an
	 * action that cannot succeed (a tool answering "error", a search with no
	 * hits) is simply chosen again by every replan until `maxReplans` runs out.
	 */
	maxActionFailures?: number;
	/**
	 * Receives a line of user-facing progress for every action that has a
	 * `describe`: `running` before it starts, `done`/`failed` when it ends.
	 * A listener that throws is ignored.
	 */
	onStep?: (step: PlanStep) => void;
	/** Receives planning/execution events (see `PlanTraceEvent`). Must not throw. */
	tracer?: PlanTracer;
	/** Checked before planning and before each action; also passed through to `execute()` as `ctx.signal` for actions that can abort their own work (e.g. a `fetch` call). Aborting stops the run between actions, not mid-`execute()` — see the KILLED state in `apps/docs/content/en/drafts/goap-actions.md`. */
	signal?: AbortSignal;
}

export interface RunPlanResult {
	finalState: WorldState;
	/** Names of actions actually run, in execution order — includes repeats across replans. */
	executedActions: string[];
	succeeded: boolean;
	/** True when the run stopped because `signal` fired, not because the goal was (un)reachable. */
	killed: boolean;
	/** Set when an action stopped the run to wait on something only the caller can supply (see `WaitingOn`) — persist `finalState` and resume with a later `runPlan` call once it's available. */
	waiting?: WaitingOn;
}

/**
 * `Partial<WorldState>`'s index signature makes plain `"waiting" in outcome`
 * narrowing unreliable for TS (a real fact could structurally collide with
 * the key) — a `WorldState` value is always a primitive, though, so
 * checking it's an object is enough to tell the two branches of
 * `ActionResult` apart at both the type and the runtime level.
 */
function isWaitingResult(
	outcome: Awaited<ReturnType<GoapAction["execute"]>>,
): outcome is { waiting: WaitingOn; facts?: Partial<WorldState> } {
	const value = (outcome as { waiting?: unknown }).waiting;
	return typeof value === "object" && value !== null;
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

/** WebMCP tool actions are the ones that can return `waiting` (they carry a `toolResult:<name>` effect); the visitor's browser runs one call at a time. */
function canWait(action: GoapAction): boolean {
	return Object.keys(action.effects).some((key) =>
		key.startsWith("toolResult:"),
	);
}

/** `a` and `b` can run side by side: no shared effect keys, neither writes what the other reads, not both able to wait. */
function independent(a: GoapAction, b: GoapAction): boolean {
	const touches = (x: GoapAction, y: GoapAction) =>
		Object.keys(x.effects).some(
			(key) => key in y.effects || key in y.preconditions,
		);
	return !touches(a, b) && !touches(b, a) && !(canWait(a) && canWait(b));
}

/** A reply (`generateReply`, `replyFromTemplate`) has no preconditions but reads the tools' answers from the state, so it must run alone and last. */
function isReply(action: GoapAction): boolean {
	return "replied" in action.effects;
}

/** The actions of `pending` (plan order) that are ready in `state` and safe to run together. */
function pickWave(pending: GoapAction[], state: WorldState): GoapAction[] {
	const wave: GoapAction[] = [];
	const onlyReplies = pending.every(isReply);
	for (const action of pending) {
		if (isReply(action) && !onlyReplies) continue;
		if (
			satisfied(action.preconditions, state) &&
			wave.every((admitted) => independent(admitted, action))
		) {
			wave.push(action);
		}
	}
	return wave;
}

/** Tells `onStep` about an action, if it has something to say. Never throws. */
function reportStep(
	run: Run,
	action: GoapAction,
	state: WorldState,
	phase: StepPhase,
): void {
	if (!run.onStep || !action.describe) return;
	try {
		const text = action.describe(state, phase);
		if (text) run.onStep({ action: action.name, phase, text });
	} catch {}
}

/** Counts one more failure of `name`; true once it reached `maxActionFailures`. */
function tooManyFailures(run: Run, name: string): boolean {
	const count = (run.failures.get(name) ?? 0) + 1;
	run.failures.set(name, count);
	return run.maxActionFailures !== undefined && count >= run.maxActionFailures;
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
	signal?: AbortSignal;
	maxActionFailures?: number;
	onStep?: (step: PlanStep) => void;
	/** Times each action finished without its promised effects, across attempts. */
	failures: Map<string, number>;
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
	const { goal, actions, ctx, executedActions, emit, signal } = run;
	const attemptIndex = run.attempts++;

	if (signal?.aborted) {
		emit({ type: "killed", attempt: attemptIndex, state });
		return {
			finalState: state,
			executedActions,
			succeeded: false,
			killed: true,
		};
	}

	const currentPlan = plan(state, goal, actions);
	if (!currentPlan) {
		emit({ type: "no_plan", attempt: attemptIndex, state });
		return {
			finalState: state,
			executedActions,
			succeeded: false,
			killed: false,
		};
	}
	emit({
		type: "planned",
		attempt: attemptIndex,
		plan: currentPlan.map(({ name, cost }) => ({ name, cost })),
		totalCost: currentPlan.reduce((sum, { cost }) => sum + cost, 0),
		state,
	});

	let nextState = state;
	let pending = currentPlan;
	while (pending.length > 0) {
		if (signal?.aborted) {
			emit({ type: "killed", attempt: attemptIndex, state: nextState });
			return {
				finalState: nextState,
				executedActions,
				succeeded: false,
				killed: true,
			};
		}

		const wave = pickWave(pending, nextState);
		if (wave.length === 0) {
			const blocked = pending[0] as GoapAction;
			emit({
				type: "action_skipped",
				attempt: attemptIndex,
				action: blocked.name,
				unmetPreconditions: unmet(blocked.preconditions, nextState),
			});
			break;
		}
		pending = pending.filter((action) => !wave.includes(action));

		const names = wave.map(({ name }) => name);
		if (wave.length > 1) {
			emit({
				type: "action_group_started",
				attempt: attemptIndex,
				actions: names,
			});
		}
		const waveState = nextState;
		const settled = await Promise.allSettled(
			wave.map(async (action) => {
				emit({
					type: "action_started",
					attempt: attemptIndex,
					action: action.name,
				});
				reportStep(run, action, waveState, "running");
				const actionStartedAt = Date.now();
				try {
					// Live state as of this wave, not just what was true when this
					// attempt started — earlier waves' real effects are already in it.
					return {
						action,
						outcome: await action.execute({ ...ctx, state: waveState, signal }),
						actionStartedAt,
					};
				} catch (error) {
					reportStep(run, action, waveState, "failed");
					emit({
						type: "action_failed",
						attempt: attemptIndex,
						action: action.name,
						durationMs: Date.now() - actionStartedAt,
						error: error instanceof Error ? error.message : String(error),
					});
					throw error;
				}
			}),
		);

		// Merged in plan order, not completion order, so the result is deterministic.
		let firstError: unknown;
		let failed = false;
		let waiting: { action: GoapAction; on: WaitingOn } | undefined;
		let giveUp = false;
		for (const result of settled) {
			if (result.status === "rejected") {
				if (!failed) firstError = result.reason;
				failed = true;
				continue;
			}
			const { action, outcome, actionStartedAt } = result.value;
			if (isWaitingResult(outcome)) {
				if (outcome.facts) nextState = { ...nextState, ...outcome.facts };
				waiting = { action, on: outcome.waiting };
				continue;
			}
			const observedEffects = outcome;
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
			const ok = satisfied(action.effects, observedEffects);
			reportStep(run, action, nextState, ok ? "done" : "failed");
			if (!ok && tooManyFailures(run, action.name)) giveUp = true;
		}
		if (wave.length > 1) {
			emit({
				type: "action_group_finished",
				attempt: attemptIndex,
				actions: names,
			});
		}

		if (failed) throw firstError;
		if (waiting) {
			emit({
				type: "waiting",
				attempt: attemptIndex,
				action: waiting.action.name,
				waiting: waiting.on,
				state: nextState,
			});
			return {
				finalState: nextState,
				executedActions,
				succeeded: false,
				killed: false,
				waiting: waiting.on,
			};
		}
		if (giveUp) {
			return {
				finalState: nextState,
				executedActions,
				succeeded: false,
				killed: false,
			};
		}
	}

	if (satisfied(goal, nextState)) {
		return {
			finalState: nextState,
			executedActions,
			succeeded: true,
			killed: false,
		};
	}
	if (replansLeft <= 0) {
		return {
			finalState: nextState,
			executedActions,
			succeeded: false,
			killed: false,
		};
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
	const {
		state,
		goal,
		actions,
		ctx,
		maxReplans = 10,
		tracer,
		signal,
		maxActionFailures,
		onStep,
	} = options;
	const startedAt = Date.now();
	const run: Run = {
		goal,
		actions,
		ctx,
		executedActions: [],
		attempts: 0,
		signal,
		maxActionFailures,
		onStep,
		failures: new Map(),
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
