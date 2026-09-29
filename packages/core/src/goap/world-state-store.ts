import type { WorldState } from "./types";

/**
 * Persists a thread's `WorldState` between separate `runPlan` calls (i.e.
 * across HTTP requests) — what a plan run that stopped short of its goal
 * (WAITING on the user, or just replans exhausted) needs so the *next*
 * turn can resume from where it left off instead of starting from a blank
 * state. Not the same thing as `HistoryStore`: that's message text for the
 * model/admin view, this is GOAP facts for the planner.
 */
export interface WorldStateStore {
	load(threadId: string): Promise<WorldState | undefined>;
	save(threadId: string, state: WorldState): Promise<void>;
	/** Called once a run actually reaches its goal — nothing left to resume. */
	clear(threadId: string): Promise<void>;
}

/** Default when no persistent store is injected, and the test double for everything else. Lost on restart — fine for tests, not for production resumability. */
export class InMemoryWorldStateStore implements WorldStateStore {
	private readonly threads = new Map<string, WorldState>();

	async load(threadId: string): Promise<WorldState | undefined> {
		return this.threads.get(threadId);
	}

	async save(threadId: string, state: WorldState): Promise<void> {
		this.threads.set(threadId, state);
	}

	async clear(threadId: string): Promise<void> {
		this.threads.delete(threadId);
	}
}
