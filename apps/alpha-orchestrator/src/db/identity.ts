import { and, eq, sql } from "drizzle-orm";
import type { Db } from "./client.ts";
import { channels, threads, users } from "./schema.ts";

export type ChannelRow = typeof channels.$inferSelect;
export type UserRow = typeof users.$inferSelect;

/**
 * Channels looked up by slug on every transport request. Cached in memory —
 * there's one orchestrator process, so admin mutations just call
 * `invalidate()` and the next lookup re-reads.
 */
export class ChannelDirectory {
	private cache: ChannelRow[] | null = null;

	constructor(private readonly db: Db) {}

	private all(): ChannelRow[] {
		if (!this.cache) this.cache = this.db.select().from(channels).all();
		return this.cache;
	}

	bySlug(slug: string): ChannelRow | undefined {
		return this.all().find((row) => row.slug === slug);
	}

	byId(id: string): ChannelRow | undefined {
		return this.all().find((row) => row.id === id);
	}

	/** Web channel owning this publishable key (what the widget sends). */
	byPublishableKey(key: string): ChannelRow | undefined {
		return this.all().find(
			(row) => row.kind === "web" && row.publishableKey === key,
		);
	}

	/**
	 * Whether any enabled web channel lists this origin. Used for CORS
	 * preflights, which carry no widget credentials to pin a channel.
	 */
	isWebOrigin(origin: string): boolean {
		return this.all().some(
			(row) =>
				row.kind === "web" &&
				row.disabledAt === null &&
				row.allowedOrigins.includes(origin),
		);
	}

	invalidate(): void {
		this.cache = null;
	}
}

/**
 * Registers an identified user on first contact, otherwise bumps
 * `lastSeenAt` (and `displayName` when one is sent). One statement, returns
 * the fresh row — so block/whitelist status is always current without a
 * separate cache for it.
 */
export function upsertIdentifiedUser(
	db: Db,
	channelId: string,
	externalUserId: string,
	displayName: string | undefined,
	now: number,
): UserRow {
	const row = db
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
	return row;
}

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
