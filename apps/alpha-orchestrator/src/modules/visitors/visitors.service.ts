import { and, eq, gt, sql } from "drizzle-orm";
import { visitors, visitorTokens } from "../database/database.schema.ts";
import type { Db } from "../database/database.ts";
import { prepared } from "../database/prepared.ts";
import { randomToken, sha256Hex } from "../security/security.service.ts";
import { generateVisitorName } from "./visitor-names.ts";
import { ownedVisitors } from "./visitors.sql.ts";
import type { VisitorAction, VisitorRow } from "./visitors.types.ts";

/** Only the sha256 of a visitor token is stored — a DB leak doesn't hand out sessions. */
export function hashVisitorToken(token: string): string {
	return sha256Hex(token);
}

/**
 * New anonymous visitor + visitor token for a widget with no session of its own.
 * 32 random bytes are unguessable, so no HMAC signature is needed, and the
 * stored hash makes the token revocable.
 */
export function createVisitor(
	db: Db,
	channelId: string,
	now: number,
	ttlMs: number,
	ip: string | null = null,
): { visitorToken: string; expiresAt: number; visitorId: string } {
	const visitorToken = randomToken("", 32);
	const visitorId = crypto.randomUUID();
	const expiresAt = now + ttlMs;
	db.$client.transaction(() => {
		db.insert(visitors)
			.values({
				id: visitorId,
				channelId,
				externalUserId: null,
				kind: "anonymous",
				name: generateVisitorName(),
				createdAt: now,
				lastSeenAt: now,
				lastIp: ip,
			})
			.run();
		db.insert(visitorTokens)
			.values({
				tokenHash: hashVisitorToken(visitorToken),
				visitorId,
				channelId,
				createdAt: now,
				lastUsedAt: now,
				expiresAt,
			})
			.run();
	})();
	return { visitorToken, expiresAt, visitorId };
}

export interface Visitor {
	row: VisitorRow;
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
			.select({ row: visitors, channelId: visitorTokens.channelId })
			.from(visitorTokens)
			.innerJoin(visitors, eq(visitors.id, visitorTokens.visitorId))
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
 * Marks the visitor as active: slides the token's expiry, bumps the visitor's
 * `lastSeenAt` (what the anonymous cleanup looks at) and records the client
 * IP when known. Coalesced: if the visitor was seen less than
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
	const recent = now - visitor.row.lastSeenAt < TOUCH_COALESCE_MS;
	const sameIp = !ip || ip === visitor.row.lastIp;
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
	const touchVisitor = prepared(db, "touchVisitor.visitor", () =>
		db
			.update(visitors)
			.set({
				lastSeenAt: sql`${sql.placeholder("now")}`,
				lastIp: sql`coalesce(${sql.placeholder("ip")}, ${visitors.lastIp})`,
			})
			.where(eq(visitors.id, sql.placeholder("visitorId")))
			.prepare(),
	);
	db.$client.transaction(() => {
		touchToken.run({
			now,
			expiresAt: now + ttlMs,
			tokenHash: visitor.tokenHash,
		});
		touchVisitor.run({ now, ip, visitorId: visitor.row.id });
	})();
	return {
		...visitor,
		row: {
			...visitor.row,
			lastSeenAt: now,
			lastIp: ip ?? visitor.row.lastIp,
		},
	};
}

/**
 * Registers an identified visitor on first contact, otherwise bumps
 * `lastSeenAt` (and `displayName` when one is sent). One statement that
 * returns the fresh row, so block/whitelist status is always current
 * without a separate cache for it.
 */
export function upsertIdentifiedVisitor(
	db: Db,
	channelId: string,
	externalUserId: string,
	displayName: string | undefined,
	now: number,
): VisitorRow {
	return db
		.insert(visitors)
		.values({
			id: crypto.randomUUID(),
			channelId,
			externalUserId,
			kind: "identified",
			displayName: displayName ?? null,
			name: generateVisitorName(),
			createdAt: now,
			lastSeenAt: now,
		})
		.onConflictDoUpdate({
			target: [visitors.channelId, visitors.externalUserId],
			set: {
				lastSeenAt: now,
				displayName: displayName ? displayName : sql`${visitors.displayName}`,
			},
		})
		.returning()
		.get();
}

const ACTION_SET_SQL: Record<VisitorAction, string> = {
	whitelist: "whitelisted_at = $now, whitelisted_by = $admin",
	unwhitelist: "whitelisted_at = NULL, whitelisted_by = NULL",
	block: "blocked_at = $now, blocked_by = $admin, blocked_reason = $reason",
	unblock: "blocked_at = NULL, blocked_by = NULL, blocked_reason = NULL",
};

/** Applies an admin action to visitors; returns how many existing visitors were updated. */
export function applyVisitorAction(
	db: Db,
	ids: string[],
	action: VisitorAction,
	adminId: string,
	now: number,
	reason?: string,
	/** Set = only visitors of this account's channels are touched. */
	ownerId?: string,
): number {
	if (ids.length === 0) return 0;
	const idBinds = Object.fromEntries(ids.map((id, i) => [`id${i}`, id]));
	const idList = Object.keys(idBinds)
		.map((key) => `$${key}`)
		.join(",");
	const owned = ownerId ? ` AND id IN (${ownedVisitors("$ownerId")})` : "";
	return db.$client
		.query<{ id: string }, Record<string, string | number | null>>(
			`UPDATE visitors SET ${ACTION_SET_SQL[action]} WHERE id IN (${idList})${owned} RETURNING id`,
		)
		.all({
			...idBinds,
			...(ownerId ? { ownerId } : {}),
			now,
			admin: adminId,
			reason: reason ?? null,
		}).length;
}

/** Whether the visitor is in a channel of `ownerId`. */
export function visitorOwnedBy(
	db: Db,
	visitorId: string,
	ownerId: string,
): boolean {
	return (
		db.$client
			.query<{ id: string }, [string, string]>(
				`${ownedVisitors("?2")} AND ov.id = ?1`,
			)
			.get(visitorId, ownerId) !== null
	);
}

/** "Erase messages": the user's messages and their GOAP traces. Usage rows stay. */
export function deleteVisitorMessages(db: Db, id: string): void {
	const sqlite = db.$client;
	sqlite.transaction(() => {
		sqlite.query("DELETE FROM messages WHERE visitor_id = ?").run(id);
		sqlite.query("DELETE FROM plan_runs WHERE visitor_id = ?").run(id);
	})();
}

/** Startup backfill: gives every visitor created before `name` existed one. Returns how many. */
export function backfillVisitorNames(db: Db): number {
	const rows = db.$client
		.query<{ id: string }, []>("SELECT id FROM visitors WHERE name = ''")
		.all();
	const set = db.$client.query("UPDATE visitors SET name = ? WHERE id = ?");
	db.$client.transaction(() => {
		for (const { id } of rows) set.run(generateVisitorName(), id);
	})();
	return rows.length;
}
