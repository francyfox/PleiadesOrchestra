import { and, desc, eq, sql } from "drizzle-orm";
import {
	messages,
	type StoredStep,
	threads,
} from "../database/database.schema.ts";
import type { Db } from "../database/database.ts";
import { prepared } from "../database/prepared.ts";

/**
 * Internal thread id for (channel, visitor, external thread id). Threads are
 * per visitor: a Telegram group chat gives each member their own history.
 */
export function resolveThreadId(
	db: Db,
	channelId: string,
	visitorId: string,
	externalThreadId: string,
	now: number,
): string {
	const existing = db
		.select({ id: threads.id })
		.from(threads)
		.where(
			and(
				eq(threads.channelId, channelId),
				eq(threads.visitorId, visitorId),
				eq(threads.externalThreadId, externalThreadId),
			),
		)
		.get();
	if (existing) return existing.id;

	const id = crypto.randomUUID();
	db.insert(threads)
		.values({ id, channelId, visitorId, externalThreadId, createdAt: now })
		.run();
	return id;
}

/** Internal thread ids behind an external thread id (optionally within one channel). */
export function threadIdsByExternal(
	db: Db,
	externalThreadId: string,
	channelId?: string,
): string[] {
	return db
		.select({ id: threads.id })
		.from(threads)
		.where(
			and(
				eq(threads.externalThreadId, externalThreadId),
				channelId ? eq(threads.channelId, channelId) : undefined,
			),
		)
		.all()
		.map((row) => row.id);
}

/** Widget conversations have no external id — the orchestrator's thread id is the handle. */
export function createWidgetThread(
	db: Db,
	channelId: string,
	visitorId: string,
	now: number,
): string {
	const id = crypto.randomUUID();
	db.insert(threads)
		.values({
			id,
			channelId,
			visitorId,
			externalThreadId: null,
			createdAt: now,
		})
		.run();
	return id;
}

/** Ownership is checked by `threads.visitorId`, never by trusting the id from the request. */
export function isOwnThread(
	db: Db,
	threadId: string,
	visitorId: string,
): boolean {
	return (
		prepared(db, "isOwnThread", () =>
			db
				.select({ id: threads.id })
				.from(threads)
				.where(
					and(
						eq(threads.id, sql.placeholder("threadId")),
						eq(threads.visitorId, sql.placeholder("visitorId")),
					),
				)
				.prepare(),
		).get({ threadId, visitorId }) !== undefined
	);
}

/**
 * The flow lines of the requests behind the given replies, by reply run id.
 * A request is a chain of runs (every browser tool result resumes it in a new
 * one) and the reply belongs to the last, so the lines of the whole chain are
 * merged in order — a step keeps its first place and its last phase, as the
 * widget shows it. A line still "running" never got its end (the visitor left
 * or the run broke), so it is not shown again.
 */
function stepsByRun(db: Db, runIds: string[]): Map<string, StoredStep[]> {
	const result = new Map<string, StoredStep[]>();
	if (runIds.length === 0) return result;
	const marks = runIds.map(() => "?").join(",");
	const sqlite = db.$client;
	const roots = new Map(
		sqlite
			.query<{ id: string; root: string }, string[]>(
				`SELECT id, COALESCE(root_run_id, id) AS root FROM plan_runs WHERE id IN (${marks})`,
			)
			.all(...runIds)
			.map((row) => [row.id, row.root]),
	);
	const rootIds = [...new Set(roots.values())];
	if (rootIds.length === 0) return result;
	const rows = sqlite
		.query<{ root: string; steps: string }, string[]>(
			`SELECT COALESCE(root_run_id, id) AS root, steps FROM plan_runs
			WHERE steps IS NOT NULL AND COALESCE(root_run_id, id) IN (${rootIds.map(() => "?").join(",")})
			ORDER BY created_at, rowid`,
		)
		.all(...rootIds);
	const merged = new Map<string, Map<string, StoredStep>>();
	for (const row of rows) {
		const steps = merged.get(row.root) ?? new Map<string, StoredStep>();
		for (const step of JSON.parse(row.steps) as StoredStep[]) {
			steps.set(step.id, step);
		}
		merged.set(row.root, steps);
	}
	for (const [runId, root] of roots) {
		const steps = [...(merged.get(root)?.values() ?? [])].filter(
			(step) => step.phase !== "running",
		);
		if (steps.length > 0) result.set(runId, steps);
	}
	return result;
}

/** The newest `limit` messages of a thread, oldest first; a reply that used tools carries its flow lines. */
export function threadMessages(db: Db, threadId: string, limit: number) {
	const rows = db
		.select({
			id: messages.id,
			role: messages.role,
			content: messages.content,
			createdAt: messages.createdAt,
			planRunId: messages.planRunId,
		})
		.from(messages)
		.where(eq(messages.threadId, threadId))
		.orderBy(desc(messages.id))
		.limit(limit)
		.all()
		.reverse();
	const steps = stepsByRun(
		db,
		rows
			.filter((row) => row.role === "assistant" && row.planRunId !== null)
			.map((row) => row.planRunId as string),
	);
	return rows.map(({ planRunId, ...row }) => {
		const lines = planRunId ? steps.get(planRunId) : undefined;
		return {
			...row,
			id: String(row.id),
			...(row.role === "assistant" && lines ? { steps: lines } : {}),
		};
	});
}
