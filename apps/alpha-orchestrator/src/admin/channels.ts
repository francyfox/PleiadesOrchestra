import { asc, count, desc, eq } from "drizzle-orm";
import type { Db } from "../db/client.ts";
import { blockedIps, channels } from "../db/schema.ts";

type ChannelRow = typeof channels.$inferSelect;

export function sha256Hex(value: string): string {
	return new Bun.CryptoHasher("sha256").update(value).digest("hex");
}

function randomKey(prefix: string, bytes: number): string {
	const buffer = crypto.getRandomValues(new Uint8Array(bytes));
	return `${prefix}${Buffer.from(buffer).toString("base64url")}`;
}

/** Public shape — never includes `secretKeyHash`. */
export function toChannel(row: ChannelRow) {
	return {
		id: row.id,
		slug: row.slug,
		name: row.name,
		kind: row.kind,
		accessMode: row.accessMode,
		allowedOrigins: row.allowedOrigins,
		publishableKey: row.publishableKey,
		disabledAt: row.disabledAt,
		createdAt: row.createdAt,
	};
}

/** Offset paging; without `pageSize` everything is returned (`page` is then ignored). */
export interface PageParams {
	page?: number;
	pageSize?: number;
}

function limitOffset({ page = 1, pageSize }: PageParams) {
	return pageSize === undefined
		? {}
		: { limit: pageSize, offset: (Math.max(1, page) - 1) * pageSize };
}

export function listChannels(db: Db, paging: PageParams = {}) {
	const { limit, offset } = limitOffset(paging);
	const query = db
		.select()
		.from(channels)
		.orderBy(asc(channels.createdAt), asc(channels.id));
	const rows =
		limit === undefined
			? query.all()
			: query
					.limit(limit)
					.offset(offset ?? 0)
					.all();
	const total = db.select({ value: count() }).from(channels).get()?.value ?? 0;
	return { items: rows.map(toChannel), total };
}

export class SlugTakenError extends Error {}

/** Only web channels are created at runtime; telegram/cli come from the seed migration. */
export function createWebChannel(
	db: Db,
	input: {
		slug: string;
		name: string;
		accessMode: "whitelist" | "open";
		allowedOrigins: string[];
	},
	now: number,
) {
	if (db.select().from(channels).where(eq(channels.slug, input.slug)).get()) {
		throw new SlugTakenError(input.slug);
	}
	const secretKey = randomKey("sk_", 32);
	const row = db
		.insert(channels)
		.values({
			id: crypto.randomUUID(),
			slug: input.slug,
			name: input.name,
			kind: "web",
			accessMode: input.accessMode,
			allowedOrigins: input.allowedOrigins,
			publishableKey: randomKey("pk_", 24),
			secretKeyHash: sha256Hex(secretKey),
			createdAt: now,
		})
		.returning()
		.get();
	return { channel: toChannel(row), secretKey };
}

export function updateChannel(
	db: Db,
	id: string,
	patch: {
		name?: string;
		accessMode?: "whitelist" | "open";
		allowedOrigins?: string[];
		disabled?: boolean;
	},
	now: number,
) {
	const existing = db.select().from(channels).where(eq(channels.id, id)).get();
	if (!existing) return null;
	const row = db
		.update(channels)
		.set({
			name: patch.name ?? existing.name,
			accessMode: patch.accessMode ?? existing.accessMode,
			allowedOrigins: patch.allowedOrigins ?? existing.allowedOrigins,
			disabledAt:
				patch.disabled === undefined
					? existing.disabledAt
					: patch.disabled
						? (existing.disabledAt ?? now)
						: null,
		})
		.where(eq(channels.id, id))
		.returning()
		.get();
	return toChannel(row);
}

/** New publishable + secret key pair; the old ones stop working immediately. */
export function rotateChannelKeys(db: Db, id: string) {
	const existing = db.select().from(channels).where(eq(channels.id, id)).get();
	if (!existing) return null;
	const secretKey = randomKey("sk_", 32);
	const row = db
		.update(channels)
		.set({
			publishableKey: randomKey("pk_", 24),
			secretKeyHash: sha256Hex(secretKey),
		})
		.where(eq(channels.id, id))
		.returning()
		.get();
	return { channel: toChannel(row), secretKey };
}

export function hashIp(ip: string, salt: string): string {
	return sha256Hex(`${salt}:${ip}`);
}

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

export class UnknownChannelError extends Error {}

export function createBlockedIp(
	db: Db,
	input: {
		ip: string;
		channelId?: string;
		reason: string;
		expiresInHours: number;
	},
	salt: string,
	now: number,
) {
	if (
		input.channelId &&
		!db.select().from(channels).where(eq(channels.id, input.channelId)).get()
	) {
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
			expiresAt: now + input.expiresInHours * 60 * 60 * 1000,
		})
		.returning()
		.get();
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
