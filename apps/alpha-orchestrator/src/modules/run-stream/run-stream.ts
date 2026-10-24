import type {
	GoapAction,
	PlanTraceEvent,
	RunLock,
	WorldState,
	WorldStateStore,
} from "@repo/core";
import { runPlan } from "@repo/core";
import { ALL_SESSION_FACTS } from "@repo/intent-presets";
import type { ActiveRuns } from "../active-runs/active-runs.ts";
import type { StoredStep } from "../database/database.schema.ts";
import type { Db } from "../database/database.ts";
import { REPLY_ACTION, REPLY_GOAL } from "../goap/goap.service.ts";
import { finishPlanRun } from "../plan-runs/plan-runs.service.ts";
import type { RunBinding } from "../run-binding/run-binding.ts";
import { encodeNdjsonLine } from "../streaming/streaming.service.ts";
import { hasQueuedTasks, progressOf } from "../tasks/tasks.service.ts";
import {
	AWAITED_ARGS_FACT,
	AWAITED_TOOL_FACT,
	awaitedArgs,
	awaitedTool,
	errorMessage,
	outcomeEvent,
} from "./run-stream.service.ts";
import type {
	PreparedRun,
	RunContext,
	StreamEvent,
} from "./run-stream.types.ts";

/** Times one action may finish without its promised effects before the run gives up. */
const MAX_ACTION_FAILURES = 2;

export interface RunStreamDeps {
	db: Db;
	runs: RunBinding;
	worldStateStore: WorldStateStore;
	runLock: RunLock;
	/** Runs executing right now, for the admin panel's live view. */
	activeRuns?: ActiveRuns;
	/** Flushed once the stream is done — `SqliteUsageRecorder` in production. */
	usageRecorder?: { flush(): void };
	now: () => number;
	/** Where persistence errors go; they never break the stream. */
	onError?: (error: unknown) => void;
}

export interface RunStreamInput {
	run: RunContext;
	signal: AbortSignal | undefined;
	/**
	 * Resolves the `state`/`goal`/`actions` to run. It is a callback so that
	 * work (loading a checkpoint, resolving actions, classifying the message)
	 * happens *inside* the stream, after the response has already started.
	 */
	prepare: () => Promise<PreparedRun>;
	/**
	 * A run with tasks queued behind it (`hasQueuedTasks`) ends without a
	 * terminal line when it finishes (or fails) and `next` makes the run of the
	 * following task, streamed on in the same response. A run that waits on a
	 * browser tool ends the stream as always; the resume continues the chain.
	 */
	next?: (finished: {
		run: RunContext;
		prepared: PreparedRun;
		finalState: WorldState;
		succeeded: boolean;
	}) => Promise<Pick<RunStreamInput, "run" | "prepare">>;
}

/** What is known about a run once it ends, however it ends. */
interface RunOutcome {
	succeeded: boolean;
	/** The run stopped to ask the browser to run a tool; it will be resumed. */
	waiting: boolean;
	/** The tool the run waits on (set with `waiting`). */
	awaitedTool?: string;
	/** JSON arguments of that call. */
	awaitedArgs?: string;
	finalState: WorldState;
	prepared: PreparedRun | undefined;
	/** The queue goes on: no terminal line was sent. */
	continues: boolean;
	/** The flow lines sent to the visitor, one per step id in its last phase (kept so a reload shows them). */
	steps: Map<string, StoredStep>;
}

/**
 * Runs a GOAP plan and streams it as NDJSON: `delta` lines while the model
 * writes, then one terminal line (`done`, `tool_call` or `error`). See
 * `StreamEvent`.
 *
 * The run is serialized per thread through `runLock` (two overlapping
 * requests must not race over the same WorldState), and `signal` stops a run
 * whose client disconnected. Trace events and usage records are buffered
 * during the run and written after the terminal line, so no SQLite write
 * happens while tokens are streaming.
 */
export function streamPlanRun(
	deps: RunStreamDeps,
	input: RunStreamInput,
): ReadableStream<Uint8Array> {
	return new ReadableStream({
		async start(controller) {
			const send = (event: StreamEvent) =>
				controller.enqueue(encodeNdjsonLine(event));
			let current: Pick<RunStreamInput, "run" | "prepare"> = input;
			try {
				for (;;) {
					const outcome = await streamOneRun(deps, input, current, send);
					if (!outcome.continues || !input.next || !outcome.prepared) break;
					try {
						current = await input.next({
							run: current.run,
							prepared: outcome.prepared,
							finalState: outcome.finalState,
							succeeded: outcome.succeeded,
						});
					} catch (error) {
						send({ type: "error", message: errorMessage(error) });
						break;
					}
				}
			} finally {
				controller.close();
			}
		},
	});
}

/** One run of the stream: executes it, then saves its trace and checkpoint. */
async function streamOneRun(
	deps: RunStreamDeps,
	input: RunStreamInput,
	current: Pick<RunStreamInput, "run" | "prepare">,
	send: (event: StreamEvent) => void,
): Promise<RunOutcome> {
	const startedAt = deps.now();
	const trace: PlanTraceEvent[] = [];
	deps.activeRuns?.start(current.run.planRunId, startedAt);
	const outcome: RunOutcome = {
		succeeded: false,
		waiting: false,
		continues: false,
		finalState: {},
		prepared: undefined,
		steps: new Map(),
	};
	try {
		await executeRun(
			deps,
			{ ...input, ...current },
			outcome,
			trace,
			send,
			startedAt,
		);
	} catch (error) {
		outcome.continues = false;
		send({ type: "error", message: errorMessage(error) });
	} finally {
		// The terminal line is already sent, so the client has its answer; the
		// work below only delays the end of the stream, which keeps
		// "response finished ⇒ persisted".
		deps.runs.unbind(current.run.threadId);
		await persistRun(deps, current.run, outcome, trace, startedAt);
		// After the trace is stored: a reader always finds the run in one of the two.
		deps.activeRuns?.finish(current.run.planRunId);
	}
	return outcome;
}

async function executeRun(
	deps: RunStreamDeps,
	input: RunStreamInput,
	outcome: RunOutcome,
	trace: PlanTraceEvent[],
	send: (event: StreamEvent) => void,
	startedAt: number,
): Promise<void> {
	const prepared = await input.prepare();
	outcome.prepared = prepared;
	outcome.finalState = prepared.state;
	const started = progressOf(prepared.state, false);
	if (started) send(started);

	const runOptions = {
		signal: input.signal,
		// A tool that answers "error" (or a search with no hits) is not worth
		// a third try: replanning would only pick the same action again.
		maxActionFailures: MAX_ACTION_FAILURES,
		onStep: (step: {
			action: string;
			phase: StoredStep["phase"];
			text: string;
		}) => {
			// Same id replaces its earlier line, as in the widget.
			outcome.steps.set(step.action, {
				id: step.action,
				phase: step.phase,
				text: step.text,
			});
			send({
				type: "step",
				id: step.action,
				phase: step.phase,
				text: step.text,
			});
		},
		tracer: (event: PlanTraceEvent) => {
			trace.push(event);
			deps.activeRuns?.push(input.run.planRunId, event);
		},
		ctx: {
			onDelta: (text: string) => send({ type: "delta", text }),
		},
	};

	const { result, explained } = await deps.runLock.withLock(
		input.run.threadId,
		async () => {
			const result = await runPlan({
				state: prepared.state,
				goal: prepared.goal,
				actions: prepared.actions,
				...runOptions,
			});
			if (
				result.succeeded ||
				result.waiting ||
				result.killed ||
				hasQueuedTasks(prepared.state)
			) {
				return { result, explained: undefined };
			}
			// The task could not be done. Rather than a bare error line, the text
			// model tells the visitor what happened and passes on the site's own
			// advice (`replyChunks` hands it the failure and the site's last answer).
			try {
				const reply = await runPlan({
					state: result.finalState,
					goal: REPLY_GOAL,
					actions: replyOnly(prepared.actions),
					...runOptions,
				});
				return { result, explained: reply.succeeded ? reply : undefined };
			} catch (error) {
				deps.onError?.(error);
				return { result, explained: undefined };
			}
		},
	);
	outcome.succeeded = result.succeeded;
	outcome.waiting = result.waiting !== undefined;
	outcome.awaitedTool = result.waiting
		? awaitedTool(result.waiting)
		: undefined;
	outcome.awaitedArgs = result.waiting
		? awaitedArgs(result.waiting)
		: undefined;
	outcome.finalState = explained?.finalState ?? result.finalState;
	// More tasks follow: no terminal line yet (a failed task is told in the final reply).
	if (
		hasQueuedTasks(prepared.state) &&
		!outcome.waiting &&
		!result.killed &&
		!input.signal?.aborted
	) {
		outcome.continues = true;
		return;
	}
	// The queue's last task ended: 2 of 2 before the final line (a tool wait is not the end).
	const ended = outcome.waiting ? undefined : progressOf(prepared.state, true);
	if (ended) send(ended);
	// The run still counts as failed (the task wasn't done); the visitor got an answer.
	send(
		explained
			? outcomeEvent(explained, deps.now() - startedAt)
			: outcomeEvent(result, deps.now() - startedAt, input.run.planRunId),
	);
}

/**
 * The actions for answering after a failed task: the reply no longer waits for
 * the task's facts (`replyAfterTask` made it wait for e.g. `inCart`, which is
 * exactly what did not happen).
 */
function replyOnly(actions: GoapAction[]): GoapAction[] {
	return actions.map((action) =>
		action.name === REPLY_ACTION ? { ...action, preconditions: {} } : action,
	);
}

/** Saves the trace and usage, then the world-state checkpoint. Failures are reported, not thrown. */
async function persistRun(
	deps: RunStreamDeps,
	run: RunContext,
	outcome: RunOutcome,
	trace: PlanTraceEvent[],
	startedAt: number,
): Promise<void> {
	try {
		finishPlanRun(deps.db, run.planRunId, {
			succeeded: outcome.succeeded,
			durationMs: deps.now() - startedAt,
			events: trace,
			steps: [...outcome.steps.values()],
		});
		deps.usageRecorder?.flush();
		await saveCheckpoint(deps.worldStateStore, run.threadId, outcome);
	} catch (error) {
		deps.onError?.(error);
	}
}

/**
 * What the next message of the thread starts from:
 * - the run stopped to wait on a browser tool: everything it got to plus its
 *   goal, so `resumeReply` can continue it;
 * - any other end (done, failed, cancelled): only the conversation's own
 *   facts (which store the shopper is in). The rest belongs to that request;
 *   keeping it made a failed search poison every message after it.
 * If `prepare()` itself threw there is nothing to save.
 */
async function saveCheckpoint(
	store: WorldStateStore,
	threadId: string,
	{
		waiting,
		finalState,
		prepared,
		awaitedTool: tool,
		awaitedArgs: args,
	}: RunOutcome,
): Promise<void> {
	if (waiting && prepared) {
		await store.save(threadId, {
			state: tool
				? {
						...finalState,
						[AWAITED_TOOL_FACT]: tool,
						[AWAITED_ARGS_FACT]: args,
					}
				: finalState,
			goal: prepared.goal,
		});
		return;
	}
	const session = sessionFacts(finalState);
	if (Object.keys(session).length > 0) {
		await store.save(threadId, { state: session, goal: {} });
	} else {
		await store.clear(threadId);
	}
}

/**
 * The facts that outlive one request: those of any preset (a run is not tied to
 * one channel's presets here; a fact a channel never sets is just absent).
 */
export function sessionFacts(state: WorldState): WorldState {
	const kept: WorldState = {};
	for (const key of ALL_SESSION_FACTS) {
		if (state[key] !== undefined) kept[key] = state[key];
	}
	return kept;
}
