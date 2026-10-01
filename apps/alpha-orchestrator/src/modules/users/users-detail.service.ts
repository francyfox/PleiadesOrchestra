import type { Db } from "../database/database.ts";
import { DAY_MS } from "../http/http.service.ts";
import { dayOf, USAGE_COLUMNS } from "../usage/usage.sql.ts";
import type { AdminMessage } from "./users.types.ts";
import { getAdminUser } from "./users-list.service.ts";

/** How many of the user's latest messages the admin detail page shows. */
const DETAIL_MESSAGE_LIMIT = 10;

type MessageRow = Omit<AdminMessage, "id" | "usage"> & { id: number };
type RunUsage = NonNullable<AdminMessage["usage"]>;

/** The user's newest messages, oldest first. */
function recentMessages(db: Db, userId: string): MessageRow[] {
	return db.$client
		.query<MessageRow, [string, number]>(
			`SELECT id, thread_id AS threadId, role, content, created_at AS createdAt, plan_run_id AS planRunId
			FROM messages WHERE user_id = ? ORDER BY id DESC LIMIT ?`,
		)
		.all(userId, DETAIL_MESSAGE_LIMIT)
		.reverse();
}

/**
 * Usage of an assistant message = all model calls of its GOAP run (ingest
 * passes + generation). Token totals are NULL if any call didn't report
 * usage — a partial sum would understate it.
 */
function usageByRun(db: Db, runIds: string[]): Map<string, RunUsage> {
	const result = new Map<string, RunUsage>();
	if (runIds.length === 0) return result;

	const rows = db.$client
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
		const incomplete = row.missing > 0;
		result.set(row.planRunId, {
			inputTokens: incomplete ? null : row.inputTokens,
			outputTokens: incomplete ? null : row.outputTokens,
			latencyMs: row.latencyMs,
		});
	}
	return result;
}

function withUsage(rows: MessageRow[], db: Db): AdminMessage[] {
	const runIds = [
		...new Set(rows.flatMap((row) => (row.planRunId ? [row.planRunId] : []))),
	];
	const usage = usageByRun(db, runIds);
	return rows.map((row) => ({
		...row,
		id: String(row.id),
		usage:
			row.role === "assistant" && row.planRunId
				? (usage.get(row.planRunId) ?? null)
				: null,
	}));
}

function usageByDay(db: Db, userId: string, since: number) {
	return db.$client
		.query<Record<string, unknown>, [string, number]>(
			`SELECT ${dayOf("at")} AS day, ${USAGE_COLUMNS}
			FROM llm_calls WHERE user_id = ? AND at >= ?
			GROUP BY day ORDER BY day`,
		)
		.all(userId, since);
}

function usageByModel(db: Db, userId: string) {
	return db.$client
		.query<Record<string, unknown>, [string]>(
			`SELECT model, kind, ${USAGE_COLUMNS}, CAST(ROUND(AVG(latency_ms)) AS INTEGER) AS avgLatencyMs
			FROM llm_calls WHERE user_id = ?
			GROUP BY model, kind ORDER BY model, kind`,
		)
		.all(userId);
}

export function getUserDetail(db: Db, id: string, now: number) {
	const user = getAdminUser(db, id);
	if (!user) return null;
	return {
		user,
		messages: withUsage(recentMessages(db, id), db),
		usageByDay: usageByDay(db, id, now - 30 * DAY_MS),
		usageByModel: usageByModel(db, id),
	};
}
