import type { HistoryStore } from "@repo/core";
import type { Db } from "../database/database.ts";

// `ai` isn't a direct dependency of this app — derive the type from the port.
export type ModelMessage = Awaited<ReturnType<HistoryStore["get"]>>[number];

/** Plain text of a message whose content is a string or a list of parts. */
export function textOf(message: ModelMessage): string {
	if (typeof message.content === "string") return message.content;
	return message.content
		.map((part) =>
			"text" in part && typeof part.text === "string" ? part.text : "",
		)
		.join("");
}

/**
 * Keeps only the newest `retentionPerUser` messages of a user (across all
 * their threads), and drops plan runs whose messages are all gone. Call
 * inside the transaction that added messages.
 */
export function trimUserHistory(
	db: Db,
	userId: string,
	retentionPerUser: number,
): void {
	const sqlite = db.$client;
	sqlite
		.query(
			`DELETE FROM messages WHERE user_id = ?1 AND id NOT IN (
				SELECT id FROM messages WHERE user_id = ?1 ORDER BY id DESC LIMIT ?2)`,
		)
		.run(userId, retentionPerUser);
	// Traces go away with their messages: finished runs whose request (the chain
	// of runs sharing a root — one waited on the browser, a later one answered)
	// has no surviving message, older than the oldest one that survives. A run still in
	// flight (`attempts = 0` until `finishPlanRun`) is never touched — the
	// same user's concurrent runs all exist before any of them appends, and
	// deleting one broke its later message insert (FOREIGN KEY failure).
	sqlite
		.query(
			`DELETE FROM plan_runs WHERE user_id = ?1
				AND attempts > 0
				AND COALESCE(root_run_id, id) NOT IN (
					SELECT COALESCE(p.root_run_id, p.id) FROM messages m
					JOIN plan_runs p ON p.id = m.plan_run_id WHERE m.user_id = ?1)
				AND created_at < (SELECT MIN(created_at) FROM messages WHERE user_id = ?1)`,
		)
		.run(userId);
}
