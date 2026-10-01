import { userStatus } from "../access/access.service.ts";
import type { Db } from "../database/database.ts";
import { SORT_SQL, STATUS_SQL, USER_SELECT, usageCte } from "./users.sql.ts";
import type { AdminUser, ChannelKind, ListUsersParams } from "./users.types.ts";

type Bind = string | number | null;
type Binds = Record<string, Bind>;

/** One row of the users ⨝ channels ⨝ usage query. */
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
	channelKind: ChannelKind;
	accessMode: "whitelist" | "open";
	channelDisabledAt: number | null;
	inputTokens: number;
	outputTokens: number;
	calls: number;
	callsWithoutUsage: number;
}

const FROM_USERS = "FROM users u JOIN channels c ON c.id = u.channel_id";

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

// Cursors are opaque to clients (docs/admin-api.md); inside they are just an
// offset — simple and stable enough for an admin table with server-side sorting.
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

/** Escapes `%`, `_` and `\` so user input is matched literally by LIKE. */
function likePattern(text: string): string {
	return `%${text.replace(/[\\%_]/g, (ch) => `\\${ch}`)}%`;
}

/** WHERE conditions (and their binds) for the list filters. */
function buildFilters(params: ListUsersParams): { sql: string; binds: Binds } {
	const conditions: string[] = [];
	const binds: Binds = {};
	if (params.channel) {
		conditions.push("c.slug = $channel");
		binds.channel = params.channel;
	}
	if (params.kind) {
		conditions.push("u.kind = $kind");
		binds.kind = params.kind;
	}
	if (params.status) {
		conditions.push(`${STATUS_SQL} = $status`);
		binds.status = params.status;
	}
	if (params.q) {
		conditions.push(
			"(u.display_name LIKE $q ESCAPE '\\' OR u.external_user_id LIKE $q ESCAPE '\\')",
		);
		binds.q = likePattern(params.q);
	}
	return {
		sql: conditions.length > 0 ? conditions.join(" AND ") : "1 = 1",
		binds,
	};
}

/**
 * Sorting by tokens needs usage for *every* user. Any other sort only needs
 * it for the users on the requested page, so the usage aggregation is limited
 * to them — otherwise each page would scan and group all of `llm_calls`.
 */
function usageCteFor(
	params: ListUsersParams,
	filtersSql: string,
	order: "ASC" | "DESC",
): string {
	if (params.sort === "tokens") return usageCte();
	return usageCte(`AND user_id IN (
		SELECT u.id ${FROM_USERS} WHERE ${filtersSql}
		ORDER BY ${SORT_SQL[params.sort]} ${order}, u.id ${order}
		LIMIT $limit OFFSET $offset)`);
}

export function listUsers(db: Db, params: ListUsersParams) {
	const filters = buildFilters(params);
	const order = params.order === "asc" ? "ASC" : "DESC";
	const offset = decodeCursor(params.cursor);
	const sqlite = db.$client;

	const rows = sqlite
		.query<UserJoinRow, Binds>(
			`${usageCteFor(params, filters.sql, order)}
			SELECT ${USER_SELECT}
			${FROM_USERS} LEFT JOIN us ON us.user_id = u.id
			WHERE ${filters.sql}
			ORDER BY ${SORT_SQL[params.sort]} ${order}, u.id ${order}
			LIMIT $limit OFFSET $offset`,
		)
		.all({
			...filters.binds,
			from: params.from,
			to: params.to,
			limit: params.limit,
			offset,
		});

	const total =
		sqlite
			.query<{ total: number }, Binds>(
				`SELECT COUNT(*) AS total ${FROM_USERS} WHERE ${filters.sql}`,
			)
			.get(filters.binds)?.total ?? 0;

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
		.query<UserJoinRow, Binds>(
			`${usageCte("AND user_id = $id")}
			SELECT ${USER_SELECT}
			${FROM_USERS} LEFT JOIN us ON us.user_id = u.id
			WHERE u.id = $id`,
		)
		.get({ id, from, to });
	return row ? toAdminUser(row) : null;
}
