import type { PlanTraceEvent } from "@repo/core";
import { eq } from "drizzle-orm";
import {
	planEvents,
	planRuns,
	type StoredStep,
} from "../database/database.schema.ts";
import type { Db } from "../database/database.ts";

/** World state carries user/model text — the full text already lives in `messages`, traces keep a preview. */
export const TRACE_STRING_LIMIT = 500;

export function truncateStrings(value: unknown, limit: number): unknown {
	if (typeof value === "string") {
		return value.length > limit ? `${value.slice(0, limit)}…` : value;
	}
	if (Array.isArray(value))
		return value.map((item) => truncateStrings(item, limit));
	if (value !== null && typeof value === "object") {
		return Object.fromEntries(
			Object.entries(value).map(([key, item]) => [
				key,
				truncateStrings(item, limit),
			]),
		);
	}
	return value;
}

export function toEventRow(runId: string, seq: number, event: PlanTraceEvent) {
	const { type, at, ...rest } = event;
	const fields = rest as Record<string, unknown>;
	const { attempt, action, ...payload } = fields;
	return {
		runId,
		seq,
		type,
		// `finished` has no `attempt`; its `attempts` count stands in for it.
		attempt:
			typeof attempt === "number" ? attempt : Number(fields.attempts ?? 0),
		action: typeof action === "string" ? action : null,
		at,
		payload: truncateStrings(payload, TRACE_STRING_LIMIT) as Record<
			string,
			unknown
		>,
	};
}

/**
 * Created before the run starts, so messages written mid-run can already
 * reference it (`messages.plan_run_id` is a foreign key).
 */
export function startPlanRun(
	db: Db,
	run: {
		id: string;
		userId: string;
		threadId: string;
		goal: Record<string, unknown>;
		createdAt: number;
		/** What the user wrote; set for a new message, not for a resumed run. */
		prompt?: string;
	},
): void {
	const { prompt, ...rest } = run;
	db.insert(planRuns)
		.values({
			...rest,
			// Its own root until `joinRequest` says it continues another run.
			rootRunId: run.id,
			prompt: prompt?.slice(0, PROMPT_LIMIT) ?? null,
			succeeded: false,
			attempts: 0,
			durationMs: 0,
		})
		.run();
}

/** Longest prompt kept on a run. */
const PROMPT_LIMIT = 2000;

/**
 * Marks `runId` as a continuation of `previousRunId` (a run resumed after the
 * browser ran its tool), so both belong to one request. Unknown previous run:
 * nothing changes — the run stays the root of its own request.
 */
export function joinRequest(
	db: Db,
	runId: string,
	previousRunId: string,
): void {
	const previous = db
		.select({ root: planRuns.rootRunId })
		.from(planRuns)
		.where(eq(planRuns.id, previousRunId))
		.get();
	if (!previous) return;
	db.update(planRuns)
		.set({ rootRunId: previous.root ?? previousRunId })
		.where(eq(planRuns.id, runId))
		.run();
}

/** Rows per INSERT: stays far below SQLite's bound-variable limit (7 columns each). */
const EVENT_INSERT_BATCH = 500;

/** How many planning attempts a run made, from its trace. */
function countAttempts(events: PlanTraceEvent[]): number {
	const finished = events.find((event) => event.type === "finished");
	if (finished?.type === "finished") return finished.attempts;
	const planned = events.filter((event) => event.type === "planned").length;
	return Math.max(planned, 1);
}

/** Completes the run and writes its buffered trace in one transaction. */
export function finishPlanRun(
	db: Db,
	runId: string,
	result: {
		succeeded: boolean;
		durationMs: number;
		events: PlanTraceEvent[];
		/** The flow lines the visitor saw during the run. */
		steps?: StoredStep[];
	},
): void {
	const eventRows = result.events.map((event, seq) =>
		toEventRow(runId, seq, event),
	);

	db.$client.transaction(() => {
		db.update(planRuns)
			.set({
				succeeded: result.succeeded,
				attempts: countAttempts(result.events),
				durationMs: result.durationMs,
				steps: result.steps && result.steps.length > 0 ? result.steps : null,
			})
			.where(eq(planRuns.id, runId))
			.run();
		// Multi-row INSERTs: one statement per batch instead of one per event.
		for (let i = 0; i < eventRows.length; i += EVENT_INSERT_BATCH) {
			db.insert(planEvents)
				.values(eventRows.slice(i, i + EVENT_INSERT_BATCH))
				.run();
		}
	})();
}
