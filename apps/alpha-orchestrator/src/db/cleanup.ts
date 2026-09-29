import { and, eq, lt } from "drizzle-orm";
import type { Db } from "./client.ts";
import { threadWorldState, users } from "./schema.ts";

const HOUR_MS = 60 * 60 * 1000;

export function anonymousCutoff(now: number, retentionHours: number): number {
	return now - retentionHours * HOUR_MS;
}

/**
 * Anonymous chat users (widget visitors without an account on the host site) are kept
 * for `retentionHours` of inactivity. Deleting the user cascades to their
 * threads, messages, visitor tokens and plan traces; `llm_calls` rows stay
 * with `user_id` NULLed so usage totals per channel/day don't change.
 */
export function deleteInactiveAnonymousUsers(
	db: Db,
	now: number,
	retentionHours: number,
): number {
	return (
		db
			.delete(users)
			.where(
				and(
					eq(users.kind, "anonymous"),
					lt(users.lastSeenAt, anonymousCutoff(now, retentionHours)),
				),
			)
			// Count via RETURNING: `changes` would also count the FK
			// `ON DELETE SET NULL` updates on llm_calls.
			.returning({ id: users.id })
			.all().length
	);
}

/** Runs the cleanup now and then every hour. Returns a stop function. */
export function scheduleAnonymousCleanup(
	db: Db,
	retentionHours: number,
	onError: (error: unknown) => void,
): () => void {
	const run = () => {
		try {
			deleteInactiveAnonymousUsers(db, Date.now(), retentionHours);
		} catch (error) {
			onError(error);
		}
	};
	run();
	const timer = setInterval(run, HOUR_MS);
	return () => clearInterval(timer);
}

export function worldStateCutoff(now: number, retentionHours: number): number {
	return now - retentionHours * HOUR_MS;
}

/**
 * A plan run that never reached its goal (stuck, replans exhausted, or the
 * visitor just never came back) leaves its `WorldState` checkpoint behind —
 * `SqliteWorldStateStore.save` has no expiry of its own (see
 * docs/laya-autonomous-webmcp.md). FK cascade (`thread_world_state.thread_id`
 * → `threads.id` → `users.id`) already clears these for anonymous visitors
 * via `deleteInactiveAnonymousUsers`; this covers the rest — identified
 * users' threads are never deleted by inactivity, so a stuck one there would
 * otherwise linger forever.
 */
export function deleteStaleWorldState(
	db: Db,
	now: number,
	retentionHours: number,
): number {
	return db
		.delete(threadWorldState)
		.where(
			lt(threadWorldState.updatedAt, worldStateCutoff(now, retentionHours)),
		)
		.returning({ threadId: threadWorldState.threadId })
		.all().length;
}

/** Runs the cleanup now and then every hour. Returns a stop function. */
export function scheduleWorldStateCleanup(
	db: Db,
	retentionHours: number,
	onError: (error: unknown) => void,
): () => void {
	const run = () => {
		try {
			deleteStaleWorldState(db, Date.now(), retentionHours);
		} catch (error) {
			onError(error);
		}
	};
	run();
	const timer = setInterval(run, HOUR_MS);
	return () => clearInterval(timer);
}
