import { and, desc, eq } from "drizzle-orm";
import { messages, threads } from "../database/database.schema.ts";
import type { Db } from "../database/database.ts";

/**
 * Internal thread id for (channel, user, external thread id). Threads are
 * per user: a Telegram group chat gives each member their own history.
 */
export function resolveThreadId(
	db: Db,
	channelId: string,
	userId: string,
	externalThreadId: string,
	now: number,
): string {
	const existing = db
		.select({ id: threads.id })
		.from(threads)
		.where(
			and(
				eq(threads.channelId, channelId),
				eq(threads.userId, userId),
				eq(threads.externalThreadId, externalThreadId),
			),
		)
		.get();
	if (existing) return existing.id;

	const id = crypto.randomUUID();
	db.insert(threads)
		.values({ id, channelId, userId, externalThreadId, createdAt: now })
		.run();
	return id;
}

/** Internal thread ids behind an external thread id (optionally within one channel). */
export function threadIdsByExternal(
	db: Db,
	externalThreadId: string,
	channelId?: string,
): string[] {
	return db
		.select({ id: threads.id })
		.from(threads)
		.where(
			and(
				eq(threads.externalThreadId, externalThreadId),
				channelId ? eq(threads.channelId, channelId) : undefined,
			),
		)
		.all()
		.map((row) => row.id);
}

/** Widget conversations have no external id — the orchestrator's thread id is the handle. */
export function createWidgetThread(
	db: Db,
	channelId: string,
	userId: string,
	now: number,
): string {
	const id = crypto.randomUUID();
	db.insert(threads)
		.values({ id, channelId, userId, externalThreadId: null, createdAt: now })
		.run();
	return id;
}

/** Ownership is checked by `threads.userId`, never by trusting the id from the request. */
export function isOwnThread(db: Db, threadId: string, userId: string): boolean {
	return (
		db
			.select({ id: threads.id })
			.from(threads)
			.where(and(eq(threads.id, threadId), eq(threads.userId, userId)))
			.get() !== undefined
	);
}

/** The newest `limit` messages of a thread, oldest first. */
export function threadMessages(db: Db, threadId: string, limit: number) {
	return db
		.select({
			id: messages.id,
			role: messages.role,
			content: messages.content,
			createdAt: messages.createdAt,
		})
		.from(messages)
		.where(eq(messages.threadId, threadId))
		.orderBy(desc(messages.id))
		.limit(limit)
		.all()
		.reverse()
		.map((row) => ({ ...row, id: String(row.id) }));
}
