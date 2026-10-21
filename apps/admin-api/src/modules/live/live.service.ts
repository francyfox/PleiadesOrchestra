import { isStaff } from "../accounts/accounts.schema.ts";
import type { LiveTopic } from "./live.types.ts";

/** The only topics a user (level 200) may watch, all scoped to their own channels. */
const USER_TOPICS: ReadonlySet<string> = new Set<LiveTopic>([
	"dashboard",
	"channels",
	"visitors",
	"visitor",
	"requests",
	"request",
	"blocked-ips",
]);

export type Scoped =
	| { ok: true; params: unknown }
	| { ok: false; code: "forbidden" };

/**
 * What a subscription of `account` really asks for. A user gets only
 * `USER_TOPICS`, and `ownerId` is set from the session, overwriting whatever the
 * browser sent. Staff pass through unchanged (they may filter by `ownerId`).
 */
export function scopeSubscription(
	account: { id: string; level: number },
	topic: string,
	params: unknown,
): Scoped {
	if (isStaff(account.level)) return { ok: true, params };
	if (!USER_TOPICS.has(topic)) return { ok: false, code: "forbidden" };
	const given =
		typeof params === "object" && params !== null && !Array.isArray(params)
			? params
			: {};
	return { ok: true, params: { ...given, ownerId: account.id } };
}
