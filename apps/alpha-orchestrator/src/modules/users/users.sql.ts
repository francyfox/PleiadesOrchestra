import { USAGE_COLUMNS } from "../usage/usage.sql.ts";

// Raw SQL rather than the drizzle query builder: these are reporting queries
// (aggregates, dynamic filters, CTEs) that read clearer as SQL. Named binds
// are passed without the `$` prefix (the database opens with `strict: true`).

/** Same rule as `userStatus()` in access.service.ts, as SQL so it can filter. */
export const STATUS_SQL = `CASE
	WHEN u.blocked_at IS NOT NULL THEN 'blocked'
	WHEN c.access_mode = 'whitelist' AND u.whitelisted_at IS NULL THEN 'pending'
	ELSE 'allowed' END`;

export const USER_SELECT = `
	u.id, u.kind, u.external_user_id AS externalUserId, u.display_name AS displayName,
	u.created_at AS createdAt, u.last_seen_at AS lastSeenAt, u.last_ip AS ip,
	u.whitelisted_at AS whitelistedAt, u.whitelisted_by AS whitelistedBy,
	u.blocked_at AS blockedAt, u.blocked_reason AS blockedReason, u.blocked_by AS blockedBy,
	c.id AS channelId, c.slug AS channelSlug, c.name AS channelName, c.kind AS channelKind,
	c.access_mode AS accessMode, c.disabled_at AS channelDisabledAt,
	COALESCE(us.inputTokens, 0) AS inputTokens, COALESCE(us.outputTokens, 0) AS outputTokens,
	COALESCE(us.calls, 0) AS calls, COALESCE(us.callsWithoutUsage, 0) AS callsWithoutUsage`;

/** Usage per user in `[$from, $to]`, optionally limited to some users (`userFilter`). */
export function usageCte(userFilter = ""): string {
	return `WITH us AS (
	SELECT user_id, ${USAGE_COLUMNS}
	FROM llm_calls WHERE user_id IS NOT NULL AND at >= $from AND at <= $to ${userFilter}
	GROUP BY user_id)`;
}

export const SORT_SQL = {
	lastSeenAt: "u.last_seen_at",
	createdAt: "u.created_at",
	tokens: "(COALESCE(us.inputTokens, 0) + COALESCE(us.outputTokens, 0))",
} as const;
