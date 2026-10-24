import { eq, lt } from "drizzle-orm";
import { threadWorldState } from "../database/database.schema.ts";
import type { Db } from "../database/database.ts";
import {
	AWAITED_TOOL_FACT,
	BROWSER_WAIT_TIMEOUT_MS,
	EXPIRED_FACT,
} from "../run-stream/run-stream.service.ts";
import { sessionFacts } from "../run-stream/run-stream.ts";
import { readQueue } from "../tasks/tasks.service.ts";

const EXPIRED_MARKER_TTL_MS = 24 * 60 * 60 * 1000;

/**
 * A run that stopped on a browser tool waits for its result in the thread's
 * checkpoint. If the browser never answers (tab closed, page navigated, tool
 * hung) the checkpoint would wait for ever: past `BROWSER_WAIT_TIMEOUT_MS` it
 * keeps only the conversation's own facts, like any other ended run, plus a
 * small marker (`EXPIRED_FACT`: the prompt and how many tasks were left) that
 * `pending` tells the widget once. A marker nobody asked for goes after
 * `EXPIRED_MARKER_TTL_MS`. A result that comes late gets "nothing to resume"
 * in-band. Returns how many threads it released.
 */
export function expireStaleWaits(db: Db, now: number): number {
	const stale = db
		.select()
		.from(threadWorldState)
		.where(lt(threadWorldState.updatedAt, now - BROWSER_WAIT_TIMEOUT_MS))
		.all()
		.filter((row) => row.state[AWAITED_TOOL_FACT] !== undefined);
	for (const row of stale) {
		const marker = JSON.stringify({
			prompt: String(row.state.userMessageRaw ?? ""),
			tasksLeft: readQueue(row.state).length,
		});
		db.update(threadWorldState)
			.set({
				state: { ...sessionFacts(row.state), [EXPIRED_FACT]: marker },
				goal: {},
				updatedAt: now,
			})
			.where(eq(threadWorldState.threadId, row.threadId))
			.run();
	}
	dropOldMarkers(db, now);
	return stale.length;
}

function dropOldMarkers(db: Db, now: number): void {
	const old = db
		.select()
		.from(threadWorldState)
		.where(lt(threadWorldState.updatedAt, now - EXPIRED_MARKER_TTL_MS))
		.all()
		.filter((row) => row.state[EXPIRED_FACT] !== undefined);
	for (const row of old) {
		const kept = sessionFacts(row.state);
		if (Object.keys(kept).length > 0)
			db.update(threadWorldState)
				.set({ state: kept })
				.where(eq(threadWorldState.threadId, row.threadId))
				.run();
		else
			db.delete(threadWorldState)
				.where(eq(threadWorldState.threadId, row.threadId))
				.run();
	}
}
