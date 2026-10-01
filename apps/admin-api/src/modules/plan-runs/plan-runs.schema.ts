import { type Static, t } from "elysia";
import { CallKind, nullable, WorldState } from "../common/common.schema.ts";

export const TraceEventType = t.UnionEnum([
	"planned",
	"no_plan",
	"action_skipped",
	"action_started",
	"action_finished",
	"action_failed",
	"replan",
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

export const PlanRun = t.Object({
	id: t.String(),
	userId: t.String(),
	threadId: t.String(),
	goal: WorldState,
	succeeded: t.Boolean(),
	attempts: t.Number(),
	durationMs: t.Number(),
	createdAt: t.Number(),
});

export const RunLlmCall = t.Object({
	actionName: nullable(t.String()),
	kind: CallKind,
	model: t.String(),
	inputTokens: nullable(t.Number()),
	outputTokens: nullable(t.Number()),
	latencyMs: t.Number(),
	ok: t.Boolean(),
	at: t.Number(),
});

export const RunDetails = t.Object({
	run: PlanRun,
	events: t.Array(TraceEvent),
	llmCalls: t.Array(RunLlmCall),
});

export type TraceEventType = Static<typeof TraceEventType>;
export type TraceEvent = Static<typeof TraceEvent>;
export type PlanRun = Static<typeof PlanRun>;
export type RunLlmCall = Static<typeof RunLlmCall>;
export type RunDetails = Static<typeof RunDetails>;
