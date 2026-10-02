import { type Static, t } from "elysia";
import { nullable } from "../common/common.schema.ts";

export const TraceEventType = t.UnionEnum([
	"planned",
	"no_plan",
	"action_skipped",
	"action_started",
	"waiting",
	"action_finished",
	"action_failed",
	"replan",
	"killed",
	"finished",
]);

/** A stored `PlanTraceEvent` with `type`/`attempt`/`action`/`at` lifted to the top level. */
export const TraceEvent = t.Object({
	seq: t.Number(),
	type: TraceEventType,
	attempt: t.Number(),
	action: nullable(t.String()),
	payload: t.Record(t.String(), t.Unknown()),
	at: t.Number(),
});

export type TraceEventType = Static<typeof TraceEventType>;
export type TraceEvent = Static<typeof TraceEvent>;
