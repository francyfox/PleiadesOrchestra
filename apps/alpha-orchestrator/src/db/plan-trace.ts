import type { PlanTraceEvent } from "@repo/core";
import { eq } from "drizzle-orm";
import type { Db } from "./client.ts";
import { planEvents, planRuns } from "./schema.ts";

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
	},
): void {
	db.insert(planRuns)
		.values({ ...run, succeeded: false, attempts: 0, durationMs: 0 })
		.run();
}

/** Completes the run and writes its buffered trace in one transaction. */
export function finishPlanRun(
	db: Db,
	runId: string,
	result: { succeeded: boolean; durationMs: number; events: PlanTraceEvent[] },
): void {
	const finished = result.events.find((event) => event.type === "finished");
	const plannedCount = result.events.filter(
		(event) => event.type === "planned",
	).length;
	const attempts =
		finished?.type === "finished"
			? finished.attempts
			: Math.max(plannedCount, 1);

	db.$client.transaction(() => {
		db.update(planRuns)
			.set({
				succeeded: result.succeeded,
				attempts,
				durationMs: result.durationMs,
			})
			.where(eq(planRuns.id, runId))
			.run();
		result.events.forEach((event, seq) => {
			db.insert(planEvents)
				.values(toEventRow(runId, seq, event))
				.run();
		});
	})();
}
