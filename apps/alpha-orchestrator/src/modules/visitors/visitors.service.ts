import { and, eq, gt } from "drizzle-orm";
import { users, visitorTokens } from "../database/database.schema.ts";
import type { Db } from "../database/database.ts";
import { randomToken, sha256Hex } from "../security/security.service.ts";
import type { UserRow } from "../users/users.types.ts";

/** Only the sha256 of a visitor token is stored — a DB leak doesn't hand out sessions. */
export function hashVisitorToken(token: string): string {
	return sha256Hex(token);
}

/**
 * New anonymous user + visitor token for a widget with no session of its own.
 * 32 random bytes are unguessable, so no HMAC signature is needed, and the
 * stored hash makes the token revocable.
 */
export function createVisitor(
	db: Db,
	channelId: string,
	now: number,
	ttlMs: number,
	ip: string | null = null,
): { visitorToken: string; expiresAt: number; userId: string } {
	const visitorToken = randomToken("", 32);
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
 * Marks the visitor as active: slides the token's expiry, bumps the user's
 * `lastSeenAt` (what the anonymous cleanup looks at) and records the client
 * IP when known. Returns the visitor as it is after the update.
 */
export function touchVisitor(
	db: Db,
	visitor: Visitor,
	now: number,
	ttlMs: number,
	ip: string | null,
): Visitor {
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
