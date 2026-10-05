import { asc, count, eq } from "drizzle-orm";
import { channels } from "../database/database.schema.ts";
import type { Db } from "../database/database.ts";
import { limitOffset, type PageParams } from "../http/http.service.ts";
import { randomToken, sha256Hex } from "../security/security.service.ts";
import type { AccessMode, ChannelRow } from "./channels.types.ts";

export class SlugTakenError extends Error {}

/** Public shape of a channel — never includes `secretKeyHash`. */
export function toChannel(row: ChannelRow) {
	return {
		id: row.id,
		slug: row.slug,
		name: row.name,
		kind: row.kind,
		accessMode: row.accessMode,
		allowedOrigins: row.allowedOrigins,
		catalogLanguage: row.catalogLanguage,
		publishableKey: row.publishableKey,
		disabledAt: row.disabledAt,
		createdAt: row.createdAt,
	};
}

function findChannel(db: Db, id: string): ChannelRow | undefined {
	return db.select().from(channels).where(eq(channels.id, id)).get();
}

/** A fresh publishable key (`pk_…`) and secret key (`sk_…`, shown once, stored hashed). */
function newKeyPair() {
	const secretKey = randomToken("sk_", 32);
	return {
		secretKey,
		publishableKey: randomToken("pk_", 24),
		secretKeyHash: sha256Hex(secretKey),
	};
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

export interface NewWebChannel {
	slug: string;
	name: string;
	accessMode: AccessMode;
	allowedOrigins: string[];
	/** Defaults to `en`. */
	catalogLanguage?: string;
}

/** Only web channels are created at runtime; telegram/cli come from the seed migration. */
export function createWebChannel(db: Db, input: NewWebChannel, now: number) {
	const slugTaken = db
		.select({ id: channels.id })
		.from(channels)
		.where(eq(channels.slug, input.slug))
		.get();
	if (slugTaken) throw new SlugTakenError(input.slug);

	const { secretKey, publishableKey, secretKeyHash } = newKeyPair();
	const row = db
		.insert(channels)
		.values({
			id: crypto.randomUUID(),
			slug: input.slug,
			name: input.name,
			kind: "web",
			accessMode: input.accessMode,
			allowedOrigins: input.allowedOrigins,
			catalogLanguage: input.catalogLanguage ?? "en",
			publishableKey,
			secretKeyHash,
			createdAt: now,
		})
		.returning()
		.get();
	return { channel: toChannel(row), secretKey };
}

export interface ChannelPatch {
	name?: string;
	accessMode?: AccessMode;
	allowedOrigins?: string[];
	catalogLanguage?: string;
	disabled?: boolean;
}

/** Disabling keeps the original time if already disabled; enabling clears it. */
function nextDisabledAt(
	current: number | null,
	disabled: boolean | undefined,
	now: number,
): number | null {
	if (disabled === undefined) return current;
	return disabled ? (current ?? now) : null;
}

export function updateChannel(
	db: Db,
	id: string,
	patch: ChannelPatch,
	now: number,
) {
	const existing = findChannel(db, id);
	if (!existing) return null;
	const row = db
		.update(channels)
		.set({
			name: patch.name ?? existing.name,
			accessMode: patch.accessMode ?? existing.accessMode,
			allowedOrigins: patch.allowedOrigins ?? existing.allowedOrigins,
			catalogLanguage: patch.catalogLanguage ?? existing.catalogLanguage,
			disabledAt: nextDisabledAt(existing.disabledAt, patch.disabled, now),
		})
		.where(eq(channels.id, id))
		.returning()
		.get();
	return toChannel(row);
}

/** New publishable + secret key pair; the old ones stop working immediately. */
export function rotateChannelKeys(db: Db, id: string) {
	if (!findChannel(db, id)) return null;
	const { secretKey, publishableKey, secretKeyHash } = newKeyPair();
	const row = db
		.update(channels)
		.set({ publishableKey, secretKeyHash })
		.where(eq(channels.id, id))
		.returning()
		.get();
	return { channel: toChannel(row), secretKey };
}
