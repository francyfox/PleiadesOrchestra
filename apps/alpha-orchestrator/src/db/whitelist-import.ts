import { and, eq, isNull } from "drizzle-orm";
import type { Db } from "./client.ts";
import { upsertIdentifiedUser } from "./identity.ts";
import { users } from "./schema.ts";

const TELEGRAM_CHANNEL_ID = "ch_telegram";
/** Stored in `whitelistedBy` so imported entries are distinguishable from admin clicks. */
export const IMPORT_MARKER = "import:ALLOWED_TELEGRAM_USER_IDS";

export function parseIds(raw: string): string[] {
	const ids = [
		...new Set(
			raw
				.split(",")
				.map((id) => id.trim())
				.filter((id) => id.length > 0),
		),
	];
	const invalid = ids.find((id) => !/^\d+$/.test(id));
	if (invalid !== undefined) {
		throw new Error(`Not a Telegram user id: ${invalid}`);
	}
	return ids;
}

/**
 * One-off migration of the old env whitelist into the DB: upserts each id as
 * an identified user of the `telegram` channel and whitelists it (an existing
 * earlier whitelisting is kept). Returns the number of ids processed.
 */
export function importTelegramWhitelist(
	db: Db,
	ids: string[],
	now: number,
): number {
	db.$client.transaction(() => {
		for (const id of ids) {
			const user = upsertIdentifiedUser(
				db,
				TELEGRAM_CHANNEL_ID,
				id,
				undefined,
				now,
			);
			db.update(users)
				.set({ whitelistedAt: now, whitelistedBy: IMPORT_MARKER })
				.where(and(eq(users.id, user.id), isNull(users.whitelistedAt)))
				.run();
		}
	})();
	return ids.length;
}
