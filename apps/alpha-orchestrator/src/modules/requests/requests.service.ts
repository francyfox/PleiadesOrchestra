import type { ActiveRuns } from "../active-runs/active-runs.ts";
import type { Db } from "../database/database.ts";
import { toEventRow } from "../plan-runs/plan-runs.service.ts";
import type {
	RequestDetails,
	RequestLlmCall,
	RequestRun,
	RequestStatus,
	RequestSummary,
	StoredEvent,
} from "./requests.types.ts";

/** A run that stopped for the browser and was not resumed within this is not coming back. */
export const WAITING_STALE_MS = 5 * 60_000;
const LIST_PROMPT_CHARS = 200;

interface RunRow {
	id: string;
	rootId: string;
	userId: string;
	threadId: string;
	prompt: string | null;
	goal: string;
	succeeded: number;
	durationMs: number;
	createdAt: number;
}

const RUN_COLUMNS = `id, COALESCE(root_run_id, id) AS rootId, user_id AS userId,
	thread_id AS threadId, prompt, goal, succeeded, duration_ms AS durationMs, created_at AS createdAt`;

const marks = (count: number) =>
	Array.from({ length: count }, () => "?").join(",");

/** Chains of the given roots, runs in the order they happened. */
function chainsOf(db: Db, rootIds: string[]): Map<string, RunRow[]> {
	const chains = new Map<string, RunRow[]>();
	if (rootIds.length === 0) return chains;
	const rows = db.$client
		.query<RunRow, string[]>(
			`SELECT ${RUN_COLUMNS} FROM plan_runs WHERE COALESCE(root_run_id, id) IN (${marks(rootIds.length)})
			ORDER BY created_at, id`,
		)
		.all(...rootIds);
	for (const row of rows) {
		const chain = chains.get(row.rootId) ?? [];
		chain.push(row);
		chains.set(row.rootId, chain);
	}
	return chains;
}

const endOf = (run: RunRow) => run.createdAt + run.durationMs;

/** Executing, paused on the browser, or over — judged by the chain's last run. */
function statusOf(
	last: RunRow,
	waitedOnBrowser: boolean,
	active: ActiveRuns,
	now: number,
): RequestStatus {
	if (active.get(last.id)) return "running";
	if (waitedOnBrowser) {
		return now - endOf(last) < WAITING_STALE_MS ? "waiting" : "abandoned";
	}
	return last.succeeded === 1 ? "succeeded" : "failed";
}

/** The request's length: to now while it goes on, else to the end of its last run. */
function durationOf(
	chain: RunRow[],
	status: RequestStatus,
	now: number,
): number {
	const first = chain[0] as RunRow;
	const last = chain.at(-1) as RunRow;
	const end = status === "running" || status === "waiting" ? now : endOf(last);
	return Math.max(0, end - first.createdAt);
}

interface PlannedInfo {
	intent: string | null;
	prompt: string | null;
}

/** `messageIntent` and `userMessage` of the first plan of each run, without loading whole payloads. */
function plannedInfo(db: Db, runIds: string[]): Map<string, PlannedInfo> {
	const info = new Map<string, PlannedInfo>();
	if (runIds.length === 0) return info;
	const rows = db.$client
		.query<
			{ runId: string; intent: string | null; prompt: string | null },
			string[]
		>(
			`SELECT run_id AS runId,
				json_extract(payload, '$.state.messageIntent') AS intent,
				json_extract(payload, '$.state.userMessage') AS prompt
			FROM plan_events WHERE type = 'planned' AND run_id IN (${marks(runIds.length)})
			ORDER BY run_id, seq`,
		)
		.all(...runIds);
	for (const row of rows) {
		if (!info.has(row.runId)) info.set(row.runId, row);
	}
	return info;
}

/** Summaries of the given roots, in the order given. */
function summarize(
	db: Db,
	active: ActiveRuns,
	roots: string[],
	now: number,
): RequestSummary[] {
	const sqlite = db.$client;
	const chains = chainsOf(db, roots);
	const runIds = [...chains.values()].flat().map((run) => run.id);

	const planned = plannedInfo(db, runIds);
	const progress = sqlite
		.query<{ runId: string; type: string; action: string | null }, string[]>(
			`SELECT run_id AS runId, type, action FROM plan_events
			WHERE type IN ('action_finished', 'waiting') AND run_id IN (${marks(runIds.length)})
			ORDER BY run_id, seq`,
		)
		.all(...runIds);
	const byRun = Map.groupBy(progress, (event) => event.runId);

	return roots.flatMap((id): RequestSummary[] => {
		const chain = chains.get(id);
		if (!chain) return [];
		const first = chain[0] as RunRow;
		const last = chain.at(-1) as RunRow;
		const lastEvents = byRun.get(last.id) ?? [];
		const waitingAction = lastEvents.find((event) => event.type === "waiting");
		const status = statusOf(last, waitingAction !== undefined, active, now);
		const steps = chain.flatMap((run) =>
			(byRun.get(run.id) ?? [])
				.filter((event) => event.type === "action_finished")
				.map((event) => event.action ?? ""),
		);
		if (status === "waiting" && waitingAction?.action) {
			steps.push(waitingAction.action);
		}
		const firstPlan = planned.get(first.id);
		return [
			{
				id,
				userId: first.userId,
				threadId: first.threadId,
				prompt:
					(first.prompt ?? firstPlan?.prompt ?? null)?.slice(
						0,
						LIST_PROMPT_CHARS,
					) ?? null,
				intent: firstPlan?.intent ?? null,
				status,
				steps,
				runs: chain.length,
				startedAt: first.createdAt,
				durationMs: durationOf(chain, status, now),
			},
		];
	});
}

/**
 * The requests table, newest first. Status and intent are not columns (the
 * status depends on the live registry and the clock, the intent lives in a
 * trace event), so a filtered list summarizes every request and cuts the page
 * afterwards — cheap, since each user keeps only a handful of chains.
 */
export function listRequests(
	db: Db,
	active: ActiveRuns,
	query: {
		page?: number;
		pageSize?: number;
		status?: RequestStatus;
		intent?: string;
	},
	now: number,
): { items: RequestSummary[]; total: number } {
	const sqlite = db.$client;
	const pageSize = query.pageSize ?? 25;
	const offset = ((query.page ?? 1) - 1) * pageSize;

	if (query.status === undefined && query.intent === undefined) {
		const total =
			sqlite
				.query<{ n: number }, []>(
					"SELECT COUNT(*) AS n FROM plan_runs WHERE COALESCE(root_run_id, id) = id",
				)
				.get()?.n ?? 0;
		const roots = sqlite
			.query<{ id: string }, [number, number]>(
				`SELECT id FROM plan_runs WHERE COALESCE(root_run_id, id) = id
				ORDER BY created_at DESC, id DESC LIMIT ? OFFSET ?`,
			)
			.all(pageSize, offset);
		return {
			items: summarize(
				db,
				active,
				roots.map((root) => root.id),
				now,
			),
			total,
		};
	}

	const roots = sqlite
		.query<{ id: string }, []>(
			`SELECT id FROM plan_runs WHERE COALESCE(root_run_id, id) = id
			ORDER BY created_at DESC, id DESC`,
		)
		.all();
	const matching = summarize(
		db,
		active,
		roots.map((root) => root.id),
		now,
	).filter(
		(item) =>
			(query.status === undefined || item.status === query.status) &&
			(query.intent === undefined || item.intent === query.intent),
	);
	return {
		items: matching.slice(offset, offset + pageSize),
		total: matching.length,
	};
}

export function getRequest(
	db: Db,
	active: ActiveRuns,
	anyRunId: string,
	now: number,
): RequestDetails | null {
	const sqlite = db.$client;
	const known = sqlite
		.query<{ rootId: string }, [string]>(
			"SELECT COALESCE(root_run_id, id) AS rootId FROM plan_runs WHERE id = ?",
		)
		.get(anyRunId);
	if (!known) return null;
	const chain = chainsOf(db, [known.rootId]).get(known.rootId);
	if (!chain) return null;
	const first = chain[0] as RunRow;
	const last = chain.at(-1) as RunRow;
	const runIds = chain.map((run) => run.id);

	const events = sqlite
		.query<
			{ runId: string } & Omit<StoredEvent, "payload"> & { payload: string },
			string[]
		>(
			`SELECT run_id AS runId, seq, type, attempt, action, payload, at FROM plan_events
			WHERE run_id IN (${marks(runIds.length)}) ORDER BY run_id, seq`,
		)
		.all(...runIds);
	const eventsByRun = Map.groupBy(events, (event) => event.runId);

	const runs = chain.map((run): RequestRun => {
		const live = active.get(run.id);
		const stored: StoredEvent[] = (eventsByRun.get(run.id) ?? []).map(
			({ runId: _runId, payload, ...event }) => ({
				...event,
				payload: JSON.parse(payload),
			}),
		);
		return {
			id: run.id,
			createdAt: run.createdAt,
			durationMs: live ? Math.max(0, now - run.createdAt) : run.durationMs,
			succeeded: run.succeeded === 1,
			running: live !== undefined,
			events: live
				? live.events.map((event, seq): StoredEvent => {
						const { runId: _runId, ...row } = toEventRow(run.id, seq, event);
						return row;
					})
				: stored,
		};
	});

	const lastRun = runs.at(-1) as RequestRun;
	const waited = lastRun.events.some((event) => event.type === "waiting");
	const status = statusOf(last, waited, active, now);

	const firstPlanned = runs[0]?.events.find(
		(event) => event.type === "planned",
	);
	const state = (firstPlanned?.payload.state ?? {}) as Record<string, unknown>;
	const reply = sqlite
		.query<{ content: string }, string[]>(
			`SELECT content FROM messages WHERE role = 'assistant' AND plan_run_id IN (${marks(runIds.length)})
			ORDER BY id DESC LIMIT 1`,
		)
		.get(...runIds)?.content;

	const llmCalls = sqlite
		.query<Omit<RequestLlmCall, "ok"> & { ok: number }, string[]>(
			`SELECT plan_run_id AS planRunId, action_name AS actionName, kind, provider, model,
				input_tokens AS inputTokens, output_tokens AS outputTokens, latency_ms AS latencyMs,
				ok, error, at
			FROM llm_calls WHERE plan_run_id IN (${marks(runIds.length)}) ORDER BY at, id`,
		)
		.all(...runIds)
		.map((call) => ({ ...call, ok: call.ok === 1 }));

	return {
		request: {
			id: known.rootId,
			userId: first.userId,
			threadId: first.threadId,
			prompt:
				first.prompt ??
				(typeof state.userMessage === "string" ? state.userMessage : null),
			intent:
				typeof state.messageIntent === "string" ? state.messageIntent : null,
			status,
			goal: JSON.parse(first.goal),
			reply: reply ?? null,
			startedAt: first.createdAt,
			durationMs: durationOf(chain, status, now),
		},
		runs,
		llmCalls,
		now,
	};
}
