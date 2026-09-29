import { type UserStatus, userStatus } from "../access.ts";
import type { Db } from "../db/client.ts";

// Named binds are passed without the `$` prefix: the database is opened
// with `strict: true` (see src/db/client.ts).
// Raw SQL here rather than the drizzle query builder: these are reporting
// queries (aggregates, dynamic filters, CTEs) that read clearer as SQL.
// Shapes returned match docs/admin-api.md exactly.

type Bind = string | number | null;

export interface UsageTotals {
	inputTokens: number;
	outputTokens: number;
	calls: number;
	callsWithoutUsage: number;
}

export interface ChannelRef {
	id: string;
	slug: string;
	name: string;
	kind: "telegram" | "cli" | "web";
}

export interface AdminUser {
	id: string;
	channel: ChannelRef;
	kind: "identified" | "anonymous";
	externalUserId: string | null;
	displayName: string | null;
	status: UserStatus;
	whitelistedAt: number | null;
	whitelistedBy: string | null;
	blockedAt: number | null;
	blockedReason: string | null;
	blockedBy: string | null;
	createdAt: number;
	lastSeenAt: number;
	/** Client IP of the last widget request (plaintext, for admins); null if unknown. */
	ip: string | null;
	usage: UsageTotals;
}

const DAY_MS = 24 * 60 * 60 * 1000;

/** Aggregate columns over `llm_calls` — SUM skips NULLs, so calls without usage don't count as 0. */
const USAGE_COLUMNS = `
	COALESCE(SUM(input_tokens), 0) AS inputTokens,
	COALESCE(SUM(output_tokens), 0) AS outputTokens,
	COUNT(*) AS calls,
	COALESCE(SUM(CASE WHEN input_tokens IS NULL OR output_tokens IS NULL THEN 1 ELSE 0 END), 0) AS callsWithoutUsage`;

/** Same rule as `userStatus()` in src/access.ts, as SQL for filtering. */
const STATUS_SQL = `CASE
	WHEN u.blocked_at IS NOT NULL THEN 'blocked'
	WHEN c.access_mode = 'whitelist' AND u.whitelisted_at IS NULL THEN 'pending'
	ELSE 'allowed' END`;

interface UserJoinRow {
	id: string;
	kind: "identified" | "anonymous";
	externalUserId: string | null;
	displayName: string | null;
	createdAt: number;
	lastSeenAt: number;
	ip: string | null;
	whitelistedAt: number | null;
	whitelistedBy: string | null;
	blockedAt: number | null;
	blockedReason: string | null;
	blockedBy: string | null;
	channelId: string;
	channelSlug: string;
	channelName: string;
	channelKind: "telegram" | "cli" | "web";
	accessMode: "whitelist" | "open";
	channelDisabledAt: number | null;
	inputTokens: number;
	outputTokens: number;
	calls: number;
	callsWithoutUsage: number;
}

const USER_SELECT = `
	u.id, u.kind, u.external_user_id AS externalUserId, u.display_name AS displayName,
	u.created_at AS createdAt, u.last_seen_at AS lastSeenAt, u.last_ip AS ip,
	u.whitelisted_at AS whitelistedAt, u.whitelisted_by AS whitelistedBy,
	u.blocked_at AS blockedAt, u.blocked_reason AS blockedReason, u.blocked_by AS blockedBy,
	c.id AS channelId, c.slug AS channelSlug, c.name AS channelName, c.kind AS channelKind,
	c.access_mode AS accessMode, c.disabled_at AS channelDisabledAt,
	COALESCE(us.inputTokens, 0) AS inputTokens, COALESCE(us.outputTokens, 0) AS outputTokens,
	COALESCE(us.calls, 0) AS calls, COALESCE(us.callsWithoutUsage, 0) AS callsWithoutUsage`;

const USAGE_CTE = `WITH us AS (
	SELECT user_id, ${USAGE_COLUMNS}
	FROM llm_calls WHERE user_id IS NOT NULL AND at >= $from AND at <= $to
	GROUP BY user_id)`;

function toAdminUser(row: UserJoinRow): AdminUser {
	return {
		id: row.id,
		channel: {
			id: row.channelId,
			slug: row.channelSlug,
			name: row.channelName,
			kind: row.channelKind,
		},
		kind: row.kind,
		externalUserId: row.externalUserId,
		displayName: row.displayName,
		status: userStatus(
			{ accessMode: row.accessMode, disabledAt: row.channelDisabledAt },
			row,
		),
		whitelistedAt: row.whitelistedAt,
		whitelistedBy: row.whitelistedBy,
		blockedAt: row.blockedAt,
		blockedReason: row.blockedReason,
		blockedBy: row.blockedBy,
		createdAt: row.createdAt,
		lastSeenAt: row.lastSeenAt,
		ip: row.ip,
		usage: {
			inputTokens: row.inputTokens,
			outputTokens: row.outputTokens,
			calls: row.calls,
			callsWithoutUsage: row.callsWithoutUsage,
		},
	};
}

export interface ListUsersParams {
	channel?: string;
	kind?: "identified" | "anonymous";
	status?: UserStatus;
	q?: string;
	sort: "lastSeenAt" | "createdAt" | "tokens";
	order: "asc" | "desc";
	from: number;
	to: number;
	cursor?: string;
	limit: number;
}

// Opaque to clients (docs/admin-api.md); internally just an offset — simple,
// and stable enough for an admin table with server-side sorting.
export function encodeCursor(offset: number): string {
	return Buffer.from(JSON.stringify({ o: offset })).toString("base64url");
}

export function decodeCursor(cursor: string | undefined): number {
	if (!cursor) return 0;
	try {
		const parsed = JSON.parse(Buffer.from(cursor, "base64url").toString());
		return typeof parsed.o === "number" && parsed.o >= 0 ? parsed.o : 0;
	} catch {
		return 0;
	}
}

const SORT_SQL = {
	lastSeenAt: "u.last_seen_at",
	createdAt: "u.created_at",
	tokens: "(COALESCE(us.inputTokens, 0) + COALESCE(us.outputTokens, 0))",
} as const;

export function listUsers(db: Db, params: ListUsersParams) {
	const where: string[] = [];
	const binds: Record<string, Bind> = { from: params.from, to: params.to };
	if (params.channel) {
		where.push("c.slug = $channel");
		binds.channel = params.channel;
	}
	if (params.kind) {
		where.push("u.kind = $kind");
		binds.kind = params.kind;
	}
	if (params.status) {
		where.push(`${STATUS_SQL} = $status`);
		binds.status = params.status;
	}
	if (params.q) {
		where.push(
			"(u.display_name LIKE $q ESCAPE '\\' OR u.external_user_id LIKE $q ESCAPE '\\')",
		);
		binds.q = `%${params.q.replace(/[\\%_]/g, (ch) => `\\${ch}`)}%`;
	}
	const whereSql = where.length > 0 ? where.join(" AND ") : "1 = 1";
	const order = params.order === "asc" ? "ASC" : "DESC";
	const offset = decodeCursor(params.cursor);
	const sqlite = db.$client;

	const rows = sqlite
		.query<UserJoinRow, Record<string, Bind>>(
			`${USAGE_CTE}
			SELECT ${USER_SELECT}
			FROM users u JOIN channels c ON c.id = u.channel_id LEFT JOIN us ON us.user_id = u.id
			WHERE ${whereSql}
			ORDER BY ${SORT_SQL[params.sort]} ${order}, u.id ${order}
			LIMIT $limit OFFSET $offset`,
		)
		.all({ ...binds, limit: params.limit, offset });

	const { from: _from, to: _to, ...countBinds } = binds;
	const total =
		sqlite
			.query<{ total: number }, Record<string, Bind>>(
				`SELECT COUNT(*) AS total FROM users u JOIN channels c ON c.id = u.channel_id WHERE ${whereSql}`,
			)
			.get(countBinds)?.total ?? 0;

	const nextOffset = offset + rows.length;
	return {
		items: rows.map(toAdminUser),
		nextCursor: nextOffset < total ? encodeCursor(nextOffset) : null,
		total,
	};
}

export function getAdminUser(
	db: Db,
	id: string,
	from = 0,
	to = Number.MAX_SAFE_INTEGER,
): AdminUser | null {
	const row = db.$client
		.query<UserJoinRow, Record<string, Bind>>(
			`${USAGE_CTE}
			SELECT ${USER_SELECT}
			FROM users u JOIN channels c ON c.id = u.channel_id LEFT JOIN us ON us.user_id = u.id
			WHERE u.id = $id`,
		)
		.get({ id, from, to });
	return row ? toAdminUser(row) : null;
}

export interface AdminMessage {
	id: string;
	threadId: string;
	role: "user" | "assistant";
	content: string;
	createdAt: number;
	planRunId: string | null;
	usage: {
		inputTokens: number | null;
		outputTokens: number | null;
		latencyMs: number;
	} | null;
}

export function getUserDetail(db: Db, id: string, now: number) {
	const user = getAdminUser(db, id);
	if (!user) return null;
	const sqlite = db.$client;

	const messageRows = sqlite
		.query<
			{
				id: number;
				threadId: string;
				role: "user" | "assistant";
				content: string;
				createdAt: number;
				planRunId: string | null;
			},
			[string]
		>(
			`SELECT id, thread_id AS threadId, role, content, created_at AS createdAt, plan_run_id AS planRunId
			FROM messages WHERE user_id = ? ORDER BY id DESC LIMIT 10`,
		)
		.all(id)
		.reverse();

	// Usage of an assistant message = all model calls of its GOAP run
	// (ingest passes + generation). Token totals are NULL if any call
	// didn't report usage — a partial sum would understate it.
	const runUsage = new Map<
		string,
		{
			inputTokens: number | null;
			outputTokens: number | null;
			latencyMs: number;
		}
	>();
	const runIds = [
		...new Set(messageRows.flatMap((m) => (m.planRunId ? [m.planRunId] : []))),
	];
	if (runIds.length > 0) {
		const rows = sqlite
			.query<
				{
					planRunId: string;
					inputTokens: number | null;
					outputTokens: number | null;
					missing: number;
					latencyMs: number;
				},
				string[]
			>(
				`SELECT plan_run_id AS planRunId, SUM(input_tokens) AS inputTokens, SUM(output_tokens) AS outputTokens,
					SUM(CASE WHEN input_tokens IS NULL OR output_tokens IS NULL THEN 1 ELSE 0 END) AS missing,
					SUM(latency_ms) AS latencyMs
				FROM llm_calls WHERE plan_run_id IN (${runIds.map(() => "?").join(",")})
				GROUP BY plan_run_id`,
			)
			.all(...runIds);
		for (const row of rows) {
			runUsage.set(row.planRunId, {
				inputTokens: row.missing > 0 ? null : row.inputTokens,
				outputTokens: row.missing > 0 ? null : row.outputTokens,
				latencyMs: row.latencyMs,
			});
		}
	}

	const messages: AdminMessage[] = messageRows.map((m) => ({
		...m,
		id: String(m.id),
		usage:
			m.role === "assistant" && m.planRunId
				? (runUsage.get(m.planRunId) ?? null)
				: null,
	}));

	const usageByDay = sqlite
		.query<Record<string, unknown>, [string, number]>(
			`SELECT strftime('%Y-%m-%d', at / 1000, 'unixepoch') AS day, ${USAGE_COLUMNS}
			FROM llm_calls WHERE user_id = ? AND at >= ?
			GROUP BY day ORDER BY day`,
		)
		.all(id, now - 30 * DAY_MS);

	const usageByModel = sqlite
		.query<Record<string, unknown>, [string]>(
			`SELECT model, kind, ${USAGE_COLUMNS}, CAST(ROUND(AVG(latency_ms)) AS INTEGER) AS avgLatencyMs
			FROM llm_calls WHERE user_id = ?
			GROUP BY model, kind ORDER BY model, kind`,
		)
		.all(id);

	return { user, messages, usageByDay, usageByModel };
}

export type UserAction = "whitelist" | "unwhitelist" | "block" | "unblock";

/** Applies an admin action to users; returns how many rows existed and were updated. */
export function applyUserAction(
	db: Db,
	ids: string[],
	action: UserAction,
	adminId: string,
	now: number,
	reason?: string,
): number {
	if (ids.length === 0) return 0;
	const set = {
		whitelist: "whitelisted_at = $now, whitelisted_by = $admin",
		unwhitelist: "whitelisted_at = NULL, whitelisted_by = NULL",
		block: "blocked_at = $now, blocked_by = $admin, blocked_reason = $reason",
		unblock: "blocked_at = NULL, blocked_by = NULL, blocked_reason = NULL",
	}[action];
	const idBinds = Object.fromEntries(ids.map((id, i) => [`id${i}`, id]));
	return db.$client
		.query<{ id: string }, Record<string, Bind>>(
			`UPDATE users SET ${set} WHERE id IN (${Object.keys(idBinds)
				.map((key) => `$${key}`)
				.join(",")}) RETURNING id`,
		)
		.all({
			...idBinds,
			now,
			admin: adminId,
			reason: reason ?? null,
		}).length;
}

/** "Стереть сообщения": the user's messages and their GOAP traces. Usage rows stay. */
export function deleteUserMessages(db: Db, id: string): void {
	const sqlite = db.$client;
	sqlite.transaction(() => {
		sqlite.query("DELETE FROM messages WHERE user_id = ?").run(id);
		sqlite.query("DELETE FROM plan_runs WHERE user_id = ?").run(id);
	})();
}

export type UsageGroupBy = "day" | "user" | "channel" | "model";

export function usageRows(
	db: Db,
	groupBy: UsageGroupBy,
	from: number,
	to: number,
	channel?: string,
) {
	const channelFilter = channel
		? "AND l.channel_id = (SELECT id FROM channels WHERE slug = $channel)"
		: "";
	const group = {
		day: {
			key: "strftime('%Y-%m-%d', l.at / 1000, 'unixepoch')",
			label: "strftime('%Y-%m-%d', l.at / 1000, 'unixepoch')",
			join: "",
		},
		user: {
			key: "l.user_id",
			// Deleted (e.g. cleaned-up anonymous) users have user_id NULL.
			label:
				"CASE WHEN l.user_id IS NULL THEN '(удалён)' ELSE COALESCE(u.display_name, u.external_user_id, u.id) END",
			join: "LEFT JOIN users u ON u.id = l.user_id",
		},
		channel: {
			key: "c.slug",
			label: "COALESCE(c.name, '(удалён)')",
			join: "LEFT JOIN channels c ON c.id = l.channel_id",
		},
		model: { key: "l.model", label: "l.model", join: "" },
	}[groupBy];

	return db.$client
		.query<Record<string, unknown>, Record<string, Bind>>(
			`SELECT ${group.key} AS key, ${group.label} AS label,
				COALESCE(SUM(l.input_tokens), 0) AS inputTokens,
				COALESCE(SUM(l.output_tokens), 0) AS outputTokens,
				COUNT(*) AS calls,
				COALESCE(SUM(CASE WHEN l.input_tokens IS NULL OR l.output_tokens IS NULL THEN 1 ELSE 0 END), 0) AS callsWithoutUsage,
				CAST(ROUND(AVG(l.latency_ms)) AS INTEGER) AS avgLatencyMs
			FROM llm_calls l ${group.join}
			WHERE l.at >= $from AND l.at <= $to ${channelFilter}
			GROUP BY 1 ORDER BY 1`,
		)
		.all({ from, to, ...(channel ? { channel } : {}) });
}

function usageSince(db: Db, since: number): UsageTotals {
	return (
		db.$client
			.query<UsageTotals, [number]>(
				`SELECT ${USAGE_COLUMNS} FROM llm_calls WHERE at >= ?`,
			)
			.get(since) ?? {
			inputTokens: 0,
			outputTokens: 0,
			calls: 0,
			callsWithoutUsage: 0,
		}
	);
}

export function stats(db: Db, now: number) {
	const users = db.$client
		.query<
			{ total: number; pending: number; blocked: number; anonymous: number },
			[]
		>(
			`SELECT COUNT(*) AS total,
				COALESCE(SUM(CASE WHEN ${STATUS_SQL} = 'pending' THEN 1 ELSE 0 END), 0) AS pending,
				COALESCE(SUM(CASE WHEN ${STATUS_SQL} = 'blocked' THEN 1 ELSE 0 END), 0) AS blocked,
				COALESCE(SUM(CASE WHEN u.kind = 'anonymous' THEN 1 ELSE 0 END), 0) AS anonymous
			FROM users u JOIN channels c ON c.id = u.channel_id`,
		)
		.get();
	const startOfDay = now - (now % DAY_MS);
	return {
		users: users ?? { total: 0, pending: 0, blocked: 0, anonymous: 0 },
		usage: {
			today: usageSince(db, startOfDay),
			last7d: usageSince(db, now - 7 * DAY_MS),
			last30d: usageSince(db, now - 30 * DAY_MS),
		},
	};
}

export function getRun(db: Db, id: string) {
	const sqlite = db.$client;
	const run = sqlite
		.query<
			{
				id: string;
				userId: string;
				threadId: string;
				goal: string;
				succeeded: number;
				attempts: number;
				durationMs: number;
				createdAt: number;
			},
			[string]
		>(
			`SELECT id, user_id AS userId, thread_id AS threadId, goal, succeeded, attempts,
				duration_ms AS durationMs, created_at AS createdAt FROM plan_runs WHERE id = ?`,
		)
		.get(id);
	if (!run) return null;

	const events = sqlite
		.query<
			{
				seq: number;
				type: string;
				attempt: number;
				action: string | null;
				payload: string;
				at: number;
			},
			[string]
		>(
			"SELECT seq, type, attempt, action, payload, at FROM plan_events WHERE run_id = ? ORDER BY seq",
		)
		.all(id)
		.map((event) => ({ ...event, payload: JSON.parse(event.payload) }));

	const llmCalls = sqlite
		.query<Record<string, unknown> & { ok: number }, [string]>(
			`SELECT action_name AS actionName, kind, model, input_tokens AS inputTokens,
				output_tokens AS outputTokens, latency_ms AS latencyMs, ok, at
			FROM llm_calls WHERE plan_run_id = ? ORDER BY at, id`,
		)
		.all(id)
		.map((call) => ({ ...call, ok: call.ok === 1 }));

	return {
		run: { ...run, goal: JSON.parse(run.goal), succeeded: run.succeeded === 1 },
		events,
		llmCalls,
	};
}

export interface DynamicActionSummary {
	name: string;
	/** From the `planned` event that scheduled it — `null` if that run only ever `action_skipped`ed it. */
	cost: number | null;
	/** The action's declared `effects` as of its most recent `action_finished` event. */
	effects: Record<string, unknown>;
	lastSeenAt: number;
}

/**
 * Actions that aren't in the static `/goap/actions` catalog because they
 * only ever existed per-request — a WebMCP tool catalog a visitor's browser
 * sent with one of their messages (`createWebMcpActions`, see
 * docs/laya-autonomous-webmcp.md). There's no live listing for these (the
 * catalog only exists inside the request that used it), so this
 * reconstructs one from that user's own `plan_events` history instead:
 * cost from the `planned` step that scheduled the action, effects from its
 * most recent `action_finished`. Preconditions aren't recoverable this way
 * (no trace event carries an action's full precondition set) — omitted,
 * not guessed.
 */
export function dynamicActionsForUser(
	db: Db,
	userId: string,
	staticActionNames: ReadonlySet<string>,
): DynamicActionSummary[] {
	const sqlite = db.$client;
	const runIds = sqlite
		.query<{ id: string }, [string]>(
			"SELECT id FROM plan_runs WHERE user_id = ?",
		)
		.all(userId)
		.map((row) => row.id);
	if (runIds.length === 0) return [];

	const placeholders = runIds.map(() => "?").join(",");
	const costByName = new Map<string, number>();
	for (const row of sqlite
		.query<{ payload: string }, Bind[]>(
			`SELECT payload FROM plan_events WHERE run_id IN (${placeholders}) AND type = 'planned' ORDER BY at`,
		)
		.all(...runIds)) {
		const payload = JSON.parse(row.payload) as {
			plan?: { name: string; cost: number }[];
		};
		for (const step of payload.plan ?? []) costByName.set(step.name, step.cost);
	}

	const byName = new Map<string, DynamicActionSummary>();
	for (const row of sqlite
		.query<{ action: string | null; payload: string; at: number }, Bind[]>(
			`SELECT action, payload, at FROM plan_events WHERE run_id IN (${placeholders}) AND type = 'action_finished' ORDER BY at`,
		)
		.all(...runIds)) {
		if (!row.action || staticActionNames.has(row.action)) continue;
		const payload = JSON.parse(row.payload) as {
			expectedEffects?: Record<string, unknown>;
		};
		byName.set(row.action, {
			name: row.action,
			cost: costByName.get(row.action) ?? null,
			effects: payload.expectedEffects ?? {},
			lastSeenAt: row.at,
		});
	}
	return [...byName.values()].sort((a, b) => b.lastSeenAt - a.lastSeenAt);
}
