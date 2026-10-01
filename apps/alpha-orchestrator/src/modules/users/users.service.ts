import { sql } from "drizzle-orm";
import { users } from "../database/database.schema.ts";
import type { Db } from "../database/database.ts";
import type { UserAction, UserRow } from "./users.types.ts";

/**
 * Registers an identified user on first contact, otherwise bumps
 * `lastSeenAt` (and `displayName` when one is sent). One statement that
 * returns the fresh row, so block/whitelist status is always current
 * without a separate cache for it.
 */
export function upsertIdentifiedUser(
	db: Db,
	channelId: string,
	externalUserId: string,
	displayName: string | undefined,
	now: number,
): UserRow {
	return db
		.insert(users)
		.values({
			id: crypto.randomUUID(),
			channelId,
			externalUserId,
			kind: "identified",
			displayName: displayName ?? null,
			createdAt: now,
			lastSeenAt: now,
		})
		.onConflictDoUpdate({
			target: [users.channelId, users.externalUserId],
			set: {
				lastSeenAt: now,
				displayName: displayName ? displayName : sql`${users.displayName}`,
			},
		})
		.returning()
		.get();
}

const ACTION_SET_SQL: Record<UserAction, string> = {
	whitelist: "whitelisted_at = $now, whitelisted_by = $admin",
	unwhitelist: "whitelisted_at = NULL, whitelisted_by = NULL",
	block: "blocked_at = $now, blocked_by = $admin, blocked_reason = $reason",
	unblock: "blocked_at = NULL, blocked_by = NULL, blocked_reason = NULL",
};

/** Applies an admin action to users; returns how many existing users were updated. */
export function applyUserAction(
	db: Db,
	ids: string[],
	action: UserAction,
	adminId: string,
	now: number,
	reason?: string,
): number {
	if (ids.length === 0) return 0;
	const idBinds = Object.fromEntries(ids.map((id, i) => [`id${i}`, id]));
	const idList = Object.keys(idBinds)
		.map((key) => `$${key}`)
		.join(",");
	return db.$client
		.query<{ id: string }, Record<string, string | number | null>>(
			`UPDATE users SET ${ACTION_SET_SQL[action]} WHERE id IN (${idList}) RETURNING id`,
		)
		.all({ ...idBinds, now, admin: adminId, reason: reason ?? null }).length;
}

/** "Erase messages": the user's messages and their GOAP traces. Usage rows stay. */
export function deleteUserMessages(db: Db, id: string): void {
	const sqlite = db.$client;
	sqlite.transaction(() => {
		sqlite.query("DELETE FROM messages WHERE user_id = ?").run(id);
		sqlite.query("DELETE FROM plan_runs WHERE user_id = ?").run(id);
	})();
}
