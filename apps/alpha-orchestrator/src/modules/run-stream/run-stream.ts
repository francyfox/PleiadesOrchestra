import type {
	PlanTraceEvent,
	RunLock,
	WorldState,
	WorldStateStore,
} from "@repo/core";
import { runPlan } from "@repo/core";
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

export interface RunStreamDeps {
	db: Db;
	runs: RunBinding;
	worldStateStore: WorldStateStore;
	runLock: RunLock;
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
			const outcome: RunOutcome = {
				succeeded: false,
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
			tracer: (event) => {
				trace.push(event);
			},
			ctx: {
				onDelta: (text: string) => send({ type: "delta", text }),
			},
		}),
	);
	outcome.succeeded = result.succeeded;
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
 * Goal reached: nothing left to resume, so drop the checkpoint. Otherwise
 * (killed, waiting on a browser-side tool, or no plan found) keep what the
 * run got to plus its goal, so the next turn can pick up from there. If
 * `prepare()` itself threw there is nothing to save.
 */
async function saveCheckpoint(
	store: WorldStateStore,
	threadId: string,
	{ succeeded, finalState, prepared }: RunOutcome,
): Promise<void> {
	if (succeeded) {
		await store.clear(threadId);
	} else if (prepared) {
		await store.save(threadId, { state: finalState, goal: prepared.goal });
	}
}
