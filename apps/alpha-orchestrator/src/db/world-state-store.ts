import type { WorldState, WorldStateStore } from "@repo/core";
import { eq } from "drizzle-orm";
import type { Db } from "./client.ts";
import { threadWorldState } from "./schema.ts";

/**
 * SQLite-backed `WorldStateStore` — the persistence half of WAITING-style
 * plan resumption (`docs/laya-autonomous-webmcp.md`). One row per thread,
 * upserted on `save`, deleted on `clear` or when the thread itself is
 * deleted (FK cascade, same as `messages`/`plan_runs`).
 */
export class SqliteWorldStateStore implements WorldStateStore {
	constructor(
		private readonly db: Db,
		private readonly now: () => number = Date.now,
	) {}

	async load(threadId: string): Promise<WorldState | undefined> {
		const row = this.db
			.select({ state: threadWorldState.state })
			.from(threadWorldState)
			.where(eq(threadWorldState.threadId, threadId))
			.get();
		return row?.state;
	}

	async save(threadId: string, state: WorldState): Promise<void> {
		this.db
			.insert(threadWorldState)
			.values({ threadId, state, updatedAt: this.now() })
			.onConflictDoUpdate({
				target: threadWorldState.threadId,
				set: { state, updatedAt: this.now() },
			})
			.run();
	}

	async clear(threadId: string): Promise<void> {
		this.db
			.delete(threadWorldState)
			.where(eq(threadWorldState.threadId, threadId))
			.run();
	}
}
