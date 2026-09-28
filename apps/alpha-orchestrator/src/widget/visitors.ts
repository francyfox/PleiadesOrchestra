import { and, desc, eq, gt, isNull, or } from "drizzle-orm";
import { sha256Hex } from "../admin/channels.ts";
import type { Db } from "../db/client.ts";
import type { UserRow } from "../db/identity.ts";
import {
	blockedIps,
	messages,
	threads,
	users,
	visitorTokens,
} from "../db/schema.ts";

/** Only the sha256 of a visitor token is stored — a DB leak doesn't hand out sessions. */
export function hashVisitorToken(token: string): string {
	return sha256Hex(token);
}

/**
 * New anonymous user + visitor token for a widget with no session of its own.
 * 32 random bytes: unguessable, so no HMAC signature is needed, and the
 * stored hash makes it revocable.
 */
export function createVisitor(
	db: Db,
	channelId: string,
	now: number,
	ttlMs: number,
	ip: string | null = null,
): { visitorToken: string; expiresAt: number; userId: string } {
	const visitorToken = Buffer.from(
		crypto.getRandomValues(new Uint8Array(32)),
	).toString("base64url");
	const userId = crypto.randomUUID();
	const expiresAt = now + ttlMs;
	db.$client.transaction(() => {
		db.insert(users)
			.values({
				id: userId,
				channelId,
				externalUserId: null,
				kind: "anonymous",
				createdAt: now,
				lastSeenAt: now,
				lastIp: ip,
			})
			.run();
		db.insert(visitorTokens)
			.values({
				tokenHash: hashVisitorToken(visitorToken),
				userId,
				channelId,
				createdAt: now,
				lastUsedAt: now,
				expiresAt,
			})
			.run();
	})();
	return { visitorToken, expiresAt, userId };
}

export interface Visitor {
	user: UserRow;
	channelId: string;
	tokenHash: string;
}

/** Looks a token up without touching it. `null` if unknown or expired. */
export function findVisitor(
	db: Db,
	token: string,
	now: number,
): Visitor | null {
	const tokenHash = hashVisitorToken(token);
	const row = db
		.select({ user: users, channelId: visitorTokens.channelId })
		.from(visitorTokens)
		.innerJoin(users, eq(users.id, visitorTokens.userId))
		.where(
			and(
				eq(visitorTokens.tokenHash, tokenHash),
				gt(visitorTokens.expiresAt, now),
			),
		)
		.get();
	return row ? { ...row, tokenHash } : null;
}

/**
 * Resolves a token for a widget request and slides its expiry; also bumps
 * the user's `lastSeenAt`, which is what the anonymous cleanup looks at, and
 * records the request's client IP (when known) for the admin view.
 */
export function useVisitor(
	db: Db,
	token: string,
	now: number,
	ttlMs: number,
	ip: string | null = null,
): Visitor | null {
	const visitor = findVisitor(db, token, now);
	if (!visitor) return null;
	db.$client.transaction(() => {
		db.update(visitorTokens)
			.set({ lastUsedAt: now, expiresAt: now + ttlMs })
			.where(eq(visitorTokens.tokenHash, visitor.tokenHash))
			.run();
		db.update(users)
			.set(ip ? { lastSeenAt: now, lastIp: ip } : { lastSeenAt: now })
			.where(eq(users.id, visitor.user.id))
			.run();
	})();
	return {
		...visitor,
		user: {
			...visitor.user,
			lastSeenAt: now,
			lastIp: ip ?? visitor.user.lastIp,
		},
	};
}

/** A block on this IP hash — global (no channel) or for this channel — that hasn't expired. */
export function isIpBlocked(
	db: Db,
	ipHash: string,
	channelId: string,
	now: number,
): boolean {
	return (
		db
			.select({ id: blockedIps.id })
			.from(blockedIps)
			.where(
				and(
					eq(blockedIps.ipHash, ipHash),
					gt(blockedIps.expiresAt, now),
					or(isNull(blockedIps.channelId), eq(blockedIps.channelId, channelId)),
				),
			)
			.get() !== undefined
	);
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
