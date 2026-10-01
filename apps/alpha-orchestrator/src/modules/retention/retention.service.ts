import { and, eq, lt } from "drizzle-orm";
import { threadWorldState, users } from "../database/database.schema.ts";
import type { Db } from "../database/database.ts";
import { HOUR_MS } from "../http/http.service.ts";

/**
 * History lives only in the messages table, so keeping fewer messages per
 * user than the agent reads per thread would silently shrink the model's
 * context. Checked once at startup.
 */
export function assertRetentionCoversHistory(
	retentionPerUser: number,
	agentHistoryMessages: number,
): void {
	if (retentionPerUser < agentHistoryMessages) {
		throw new Error(
			`MESSAGE_RETENTION_PER_USER (${retentionPerUser}) must be ≥ the agent's history window (${agentHistoryMessages})`,
		);
	}
}

/** Timestamp before which something counts as expired. */
export function retentionCutoff(now: number, retentionHours: number): number {
	return now - retentionHours * HOUR_MS;
}

/**
 * Anonymous chat users (widget visitors without an account on the host site)
 * are kept for `retentionHours` of inactivity. Deleting the user cascades to
 * their threads, messages, visitor tokens and plan traces; `llm_calls` rows
 * stay with `user_id` NULLed so usage totals per channel/day don't change.
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
					lt(users.lastSeenAt, retentionCutoff(now, retentionHours)),
				),
			)
			// Count via RETURNING: `changes` would also count the FK
			// `ON DELETE SET NULL` updates on llm_calls.
			.returning({ id: users.id })
			.all().length
	);
}

/**
 * A plan run that never reached its goal (stuck, replans exhausted, or the
 * visitor never came back) leaves its `WorldState` checkpoint behind, and
 * `SqliteWorldStateStore.save` has no expiry of its own. The FK cascade
 * already clears these for anonymous visitors; this covers identified users,
 * whose threads are never deleted by inactivity.
 */
export function deleteStaleWorldState(
	db: Db,
	now: number,
	retentionHours: number,
): number {
	return db
		.delete(threadWorldState)
		.where(lt(threadWorldState.updatedAt, retentionCutoff(now, retentionHours)))
		.returning({ threadId: threadWorldState.threadId })
		.all().length;
}

/** Runs `job` now and then every hour; errors go to `onError`. Returns a stop function. */
export function scheduleHourly(
	job: () => void,
	onError: (error: unknown) => void,
): () => void {
	const run = () => {
		try {
			job();
		} catch (error) {
			onError(error);
		}
	};
	run();
	const timer = setInterval(run, HOUR_MS);
	return () => clearInterval(timer);
}
