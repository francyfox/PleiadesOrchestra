import { and, eq, gt, sql } from "drizzle-orm";
import { users, visitorTokens } from "../database/database.schema.ts";
import type { Db } from "../database/database.ts";
import { prepared } from "../database/prepared.ts";
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
	const row = prepared(db, "findVisitor", () =>
		db
			.select({ user: users, channelId: visitorTokens.channelId })
			.from(visitorTokens)
			.innerJoin(users, eq(users.id, visitorTokens.userId))
			.where(
				and(
					eq(visitorTokens.tokenHash, sql.placeholder("tokenHash")),
					gt(visitorTokens.expiresAt, sql.placeholder("now")),
				),
			)
			.prepare(),
	).get({ tokenHash, now });
	return row ? { ...row, tokenHash } : null;
}

/**
 * Writes for the same visitor closer together than this are skipped: a widget
 * polls several endpoints per page view, and every touch is a writer-lock
 * grab. The token TTL is 24 h, so a 60 s lag in `lastSeenAt`/`expiresAt` is
 * invisible to admin views (they show minutes) and to expiry.
 */
export const TOUCH_COALESCE_MS = 60_000;

/**
 * Marks the visitor as active: slides the token's expiry, bumps the user's
 * `lastSeenAt` (what the anonymous cleanup looks at) and records the client
 * IP when known. Coalesced: if the user was seen less than
 * `TOUCH_COALESCE_MS` ago and the IP is unchanged, nothing is written.
 * Returns the visitor as it is after the call.
 */
export function touchVisitor(
	db: Db,
	visitor: Visitor,
	now: number,
	ttlMs: number,
	ip: string | null,
): Visitor {
	const recent = now - visitor.user.lastSeenAt < TOUCH_COALESCE_MS;
	const sameIp = !ip || ip === visitor.user.lastIp;
	if (recent && sameIp) return visitor;
	const touchToken = prepared(db, "touchVisitor.token", () =>
		db
			.update(visitorTokens)
			.set({
				lastUsedAt: sql`${sql.placeholder("now")}`,
				expiresAt: sql`${sql.placeholder("expiresAt")}`,
			})
			.where(eq(visitorTokens.tokenHash, sql.placeholder("tokenHash")))
			.prepare(),
	);
	const touchUser = prepared(db, "touchVisitor.user", () =>
		db
			.update(users)
			.set({
				lastSeenAt: sql`${sql.placeholder("now")}`,
				lastIp: sql`coalesce(${sql.placeholder("ip")}, ${users.lastIp})`,
			})
			.where(eq(users.id, sql.placeholder("userId")))
			.prepare(),
	);
	db.$client.transaction(() => {
		touchToken.run({
			now,
			expiresAt: now + ttlMs,
			tokenHash: visitor.tokenHash,
		});
		touchUser.run({ now, ip, userId: visitor.user.id });
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
