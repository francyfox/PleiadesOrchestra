import { and, count, desc, eq, gt, isNull, or } from "drizzle-orm";
import { blockedIps, channels } from "../database/database.schema.ts";
import type { Db } from "../database/database.ts";
import { HOUR_MS, limitOffset, type PageParams } from "../http/http.service.ts";
import { hashIp } from "../security/security.service.ts";

export class UnknownChannelError extends Error {}

/** Newest first. */
export function listBlockedIps(db: Db, paging: PageParams = {}) {
	const { limit, offset } = limitOffset(paging);
	const query = db
		.select()
		.from(blockedIps)
		.orderBy(desc(blockedIps.createdAt), desc(blockedIps.id));
	const items =
		limit === undefined
			? query.all()
			: query
					.limit(limit)
					.offset(offset ?? 0)
					.all();
	const total =
		db.select({ value: count() }).from(blockedIps).get()?.value ?? 0;
	return { items, total };
}

export interface NewBlockedIp {
	ip: string;
	channelId?: string;
	reason: string;
	expiresInHours: number;
}

export function createBlockedIp(
	db: Db,
	input: NewBlockedIp,
	salt: string,
	now: number,
) {
	if (input.channelId && !channelExists(db, input.channelId)) {
		throw new UnknownChannelError(input.channelId);
	}
	return db
		.insert(blockedIps)
		.values({
			id: crypto.randomUUID(),
			ipHash: hashIp(input.ip, salt),
			ip: input.ip,
			channelId: input.channelId ?? null,
			reason: input.reason,
			createdAt: now,
			expiresAt: now + input.expiresInHours * HOUR_MS,
		})
		.returning()
		.get();
}

function channelExists(db: Db, id: string): boolean {
	return (
		db
			.select({ id: channels.id })
			.from(channels)
			.where(eq(channels.id, id))
			.get() !== undefined
	);
}

export function deleteBlockedIp(db: Db, id: string): boolean {
	return (
		db
			.delete(blockedIps)
			.where(eq(blockedIps.id, id))
			.returning({ id: blockedIps.id })
			.all().length > 0
	);
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
