import { eq, lt } from "drizzle-orm";
import { threadWorldState } from "../database/database.schema.ts";
import type { Db } from "../database/database.ts";
import {
	AWAITED_TOOL_FACT,
	BROWSER_WAIT_TIMEOUT_MS,
} from "../run-stream/run-stream.service.ts";
import { sessionFacts } from "../run-stream/run-stream.ts";

/**
 * A run that stopped on a browser tool waits for its result in the thread's
 * checkpoint. If the browser never answers (tab closed, page navigated, tool
 * hung) the checkpoint would wait for ever: past `BROWSER_WAIT_TIMEOUT_MS` it
 * keeps only the conversation's own facts, like any other ended run. A result
 * that comes late then gets "nothing to resume" in-band. Returns how many
 * threads it released.
 */
export function expireStaleWaits(db: Db, now: number): number {
	const stale = db
		.select()
		.from(threadWorldState)
		.where(lt(threadWorldState.updatedAt, now - BROWSER_WAIT_TIMEOUT_MS))
		.all()
		.filter((row) => row.state[AWAITED_TOOL_FACT] !== undefined);
	for (const row of stale) {
		const kept = sessionFacts(row.state);
		const rows = db
			.update(threadWorldState)
			.set({ state: kept, goal: {} })
			.where(eq(threadWorldState.threadId, row.threadId));
		if (Object.keys(kept).length > 0) rows.run();
		else
			db.delete(threadWorldState)
				.where(eq(threadWorldState.threadId, row.threadId))
				.run();
	}
	return stale.length;
}
