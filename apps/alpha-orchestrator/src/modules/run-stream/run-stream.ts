import type {
	PlanTraceEvent,
	RunLock,
	WorldState,
	WorldStateStore,
} from "@repo/core";
import { runPlan, SESSION_FACTS } from "@repo/core";
import type { ActiveRuns } from "../active-runs/active-runs.ts";
import type { Db } from "../database/database.ts";
import { finishPlanRun } from "../plan-runs/plan-runs.service.ts";
import type { RunBinding } from "../run-binding/run-binding.ts";
import { encodeNdjsonLine } from "../streaming/streaming.service.ts";
import { errorMessage, outcomeEvent } from "./run-stream.service.ts";
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
}

/** What is known about a run once it ends, however it ends. */
interface RunOutcome {
	succeeded: boolean;
	/** The run stopped to ask the browser to run a tool; it will be resumed. */
	waiting: boolean;
	finalState: WorldState;
	prepared: PreparedRun | undefined;
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
			const startedAt = deps.now();
			const trace: PlanTraceEvent[] = [];
			deps.activeRuns?.start(input.run.planRunId, startedAt);
			const outcome: RunOutcome = {
				succeeded: false,
				waiting: false,
				finalState: {},
				prepared: undefined,
			};

			try {
				await executeRun(deps, input, outcome, trace, send, startedAt);
			} catch (error) {
				send({ type: "error", message: errorMessage(error) });
			} finally {
				// The terminal line is already sent, so the client has its answer; the
				// work below only delays the end of the stream, which keeps
				// "response finished ⇒ persisted".
				deps.runs.unbind(input.run.threadId);
				await persistRun(deps, input.run, outcome, trace, startedAt);
				// After the trace is stored: a reader always finds the run in one of the two.
				deps.activeRuns?.finish(input.run.planRunId);
				controller.close();
			}
		},
	});
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

	const result = await deps.runLock.withLock(input.run.threadId, () =>
		runPlan({
			state: prepared.state,
			goal: prepared.goal,
			actions: prepared.actions,
			signal: input.signal,
			// A tool that answers "error" (or a search with no hits) is not worth
			// a third try: replanning would only pick the same action again.
			maxActionFailures: MAX_ACTION_FAILURES,
			onStep: (step) =>
				send({
					type: "step",
					id: step.action,
					phase: step.phase,
					text: step.text,
				}),
			tracer: (event) => {
				trace.push(event);
				deps.activeRuns?.push(input.run.planRunId, event);
			},
			ctx: {
				onDelta: (text: string) => send({ type: "delta", text }),
			},
		}),
	);
	outcome.succeeded = result.succeeded;
	outcome.waiting = result.waiting !== undefined;
	outcome.finalState = result.finalState;
	send(outcomeEvent(result, deps.now() - startedAt));
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
	{ waiting, finalState, prepared }: RunOutcome,
): Promise<void> {
	if (waiting && prepared) {
		await store.save(threadId, { state: finalState, goal: prepared.goal });
		return;
	}
	const session = sessionFacts(finalState);
	if (Object.keys(session).length > 0) {
		await store.save(threadId, { state: session, goal: {} });
	} else {
		await store.clear(threadId);
	}
}

/** The facts that outlive one request (see `SESSION_FACTS`). */
export function sessionFacts(state: WorldState): WorldState {
	const kept: WorldState = {};
	for (const key of SESSION_FACTS) {
		if (state[key] !== undefined) kept[key] = state[key];
	}
	return kept;
}
