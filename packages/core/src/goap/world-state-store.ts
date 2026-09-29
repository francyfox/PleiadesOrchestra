import type { WorldState } from "./types";

/**
 * A paused run's full resumable state: not just the facts (`state`) but the
 * `goal` it was pursuing. Needed once a run can stop on `WaitingOn` (see
 * `executor.ts`) and resume in a *later* HTTP request — re-deriving the goal
 * from scratch at resume time (e.g. re-running `classifyMessageIntent` on
 * the original message) risks landing on a different goal the second time;
 * persisting it is what makes a resume provably continue the same run.
 */
export interface WorldStateCheckpoint {
	state: WorldState;
	goal: Partial<WorldState>;
}

/**
 * Persists a thread's `WorldStateCheckpoint` between separate `runPlan`
 * calls (i.e. across HTTP requests) — what a plan run that stopped short of
 * its goal (WAITING on the user or a browser-side tool call, or just
 * replans exhausted) needs so the *next* turn can resume from where it left
 * off instead of starting from a blank state. Not the same thing as
 * `HistoryStore`: that's message text for the model/admin view, this is
 * GOAP facts for the planner.
 */
export interface WorldStateStore {
	load(threadId: string): Promise<WorldStateCheckpoint | undefined>;
	save(threadId: string, checkpoint: WorldStateCheckpoint): Promise<void>;
	/** Called once a run actually reaches its goal — nothing left to resume. */
	clear(threadId: string): Promise<void>;
}

/** Default when no persistent store is injected, and the test double for everything else. Lost on restart — fine for tests, not for production resumability. */
export class InMemoryWorldStateStore implements WorldStateStore {
	private readonly threads = new Map<string, WorldStateCheckpoint>();

	async load(threadId: string): Promise<WorldStateCheckpoint | undefined> {
		return this.threads.get(threadId);
	}

	async save(
		threadId: string,
		checkpoint: WorldStateCheckpoint,
	): Promise<void> {
		this.threads.set(threadId, checkpoint);
	}

	async clear(threadId: string): Promise<void> {
		this.threads.delete(threadId);
	}
}
