import type { CallContext, HistoryStore } from "@repo/core";
import { desc, eq } from "drizzle-orm";
import type { Db } from "./client.ts";
import type { RunBinding } from "./run-binding.ts";
import { messages } from "./schema.ts";

// `ai` isn't a direct dependency of this app — derive the type from the port.
type ModelMessage = Awaited<ReturnType<HistoryStore["get"]>>[number];

function textOf(message: ModelMessage): string {
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
	// Raw SQL reads clearer than a query-builder chain here.
	sqlite
		.query(
			`DELETE FROM messages WHERE user_id = ?1 AND id NOT IN (
				SELECT id FROM messages WHERE user_id = ?1 ORDER BY id DESC LIMIT ?2)`,
		)
		.run(userId, retentionPerUser);
	// Traces go away with their messages: finished runs with no surviving
	// messages, older than the oldest one that survives. A run still in
	// flight (`attempts = 0` until `finishPlanRun`) is never touched — the
	// same user's concurrent runs all exist before any of them appends, and
	// deleting one broke its later message insert (FOREIGN KEY failure).
	sqlite
		.query(
			`DELETE FROM plan_runs WHERE user_id = ?1
				AND attempts > 0
				AND id NOT IN (SELECT plan_run_id FROM messages WHERE user_id = ?1 AND plan_run_id IS NOT NULL)
				AND created_at < (SELECT MIN(created_at) FROM messages WHERE user_id = ?1)`,
		)
		.run(userId);
}

/**
 * Conversation history in SQLite. The same table is both the model's
 * context (last N messages of a thread) and what the admin panel shows —
 * there's no separate in-memory copy. Only the last `retentionPerUser`
 * messages per *user* (across all their threads) are kept.
 */
export class SqliteHistoryStore implements HistoryStore {
	constructor(
		private readonly db: Db,
		private readonly retentionPerUser: number,
		private readonly runs: RunBinding,
		private readonly now: () => number = Date.now,
	) {}

	async get(threadId: string, limit: number): Promise<ModelMessage[]> {
		const rows = this.db
			.select({ role: messages.role, content: messages.content })
			.from(messages)
			.where(eq(messages.threadId, threadId))
			.orderBy(desc(messages.id))
			.limit(limit)
			.all();
		return rows
			.reverse()
			.map((row) => ({ role: row.role, content: row.content }));
	}

	async append(ctx: CallContext, newMessages: ModelMessage[]): Promise<void> {
		const planRunId = this.runs.resolve(ctx.threadId, ctx.planRunId) ?? null;
		const createdAt = this.now();
		const sqlite = this.db.$client;

		sqlite.transaction(() => {
			for (const message of newMessages) {
				if (message.role !== "user" && message.role !== "assistant") continue;
				this.db
					.insert(messages)
					.values({
						threadId: ctx.threadId,
						userId: ctx.userId,
						role: message.role,
						content: textOf(message),
						createdAt,
						planRunId,
					})
					.run();
			}

			trimUserHistory(this.db, ctx.userId, this.retentionPerUser);
		})();
	}

	async reset(threadId: string): Promise<void> {
		this.db.delete(messages).where(eq(messages.threadId, threadId)).run();
	}
}
