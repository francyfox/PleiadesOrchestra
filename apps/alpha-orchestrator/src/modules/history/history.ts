import type { CallContext, HistoryStore } from "@repo/core";
import { desc, eq } from "drizzle-orm";
import { messages } from "../database/database.schema.ts";
import type { Db } from "../database/database.ts";
import type { RunBinding } from "../run-binding/run-binding.ts";
import {
	type ModelMessage,
	textOf,
	trimUserHistory,
} from "./history.service.ts";

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
