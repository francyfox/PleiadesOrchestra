import { type Static, t } from "elysia";
import {
	nullable,
	oneOf,
	PageQuery,
	WorldState,
} from "../common/common.schema.ts";
import { TraceEvent } from "../plan-runs/plan-runs.schema.ts";

const REQUEST_STATUSES = [
	"running",
	"waiting",
	"succeeded",
	"failed",
	"abandoned",
] as const;

export const RequestStatus = t.UnionEnum(REQUEST_STATUSES);

/** Paging plus optional filters; an omitted filter means "all". */
export const RequestsQuery = t.Composite([
	PageQuery,
	t.Object({
		status: t.Optional(oneOf(REQUEST_STATUSES)),
		intent: t.Optional(t.String({ minLength: 1, maxLength: 64 })),
	}),
]);

/** One row of the requests table: a user message and what became of it. */
export const RequestSummary = t.Object({
	id: t.String(),
	userId: t.String(),
	threadId: t.String(),
	prompt: nullable(t.String()),
	intent: nullable(t.String()),
	status: RequestStatus,
	steps: t.Array(t.String()),
	runs: t.Number(),
	startedAt: t.Number(),
	durationMs: t.Number(),
});

export const RequestsPage = t.Object({
	items: t.Array(RequestSummary),
	total: t.Number(),
});

// --- what the orchestrator sends (`GET /v1/admin/requests/:id`) -----------

export const UpstreamRequestRun = t.Object({
	id: t.String(),
	createdAt: t.Number(),
	durationMs: t.Number(),
	succeeded: t.Boolean(),
	running: t.Boolean(),
	events: t.Array(TraceEvent),
});

export const UpstreamLlmCall = t.Object({
	planRunId: nullable(t.String()),
	actionName: nullable(t.String()),
	kind: t.String(),
	provider: t.String(),
	model: t.String(),
	inputTokens: nullable(t.Number()),
	outputTokens: nullable(t.Number()),
	latencyMs: t.Number(),
	ok: t.Boolean(),
	error: nullable(t.String()),
	at: t.Number(),
});

export const UpstreamRequestDetails = t.Object({
	request: t.Object({
		id: t.String(),
		userId: t.String(),
		threadId: t.String(),
		prompt: nullable(t.String()),
		intent: nullable(t.String()),
		status: RequestStatus,
		goal: WorldState,
		reply: nullable(t.String()),
		startedAt: t.Number(),
		durationMs: t.Number(),
	}),
	runs: t.Array(UpstreamRequestRun),
	llmCalls: t.Array(UpstreamLlmCall),
	now: t.Number(),
});

// --- what the panel draws ---------------------------------------------------

export const NodeKind = t.UnionEnum([
	"prompt",
	"translate",
	"understand",
	"action",
	"result",
]);

export const NodeStatus = t.UnionEnum([
	"done",
	"running",
	"browser",
	"failed",
	"skipped",
	"diverged",
	"pending",
	"not_reached",
	"reached",
	"missed",
]);

/** One model call that belongs to a node. */
export const NodeCall = t.Object({
	provider: t.String(),
	model: t.String(),
	latencyMs: t.Number(),
	inputTokens: nullable(t.Number()),
	outputTokens: nullable(t.Number()),
	ok: t.Boolean(),
	error: nullable(t.String()),
});

export const NodeDetail = t.Object({
	/** The prompt, the reply, or the tool's answer — whichever the node is about. */
	text: nullable(t.String()),
	intent: nullable(t.String()),
	goal: nullable(WorldState),
	/** The browser tool this step asked for, and the arguments it was called with. */
	tool: nullable(t.String()),
	toolArgs: nullable(t.Record(t.String(), t.Unknown())),
	/** What the browser took to answer, from the server pausing to resuming. */
	browserMs: nullable(t.Number()),
	expected: nullable(WorldState),
	effects: nullable(WorldState),
	error: nullable(t.String()),
	calls: t.Array(NodeCall),
});

export const RequestNode = t.Object({
	id: t.String(),
	kind: NodeKind,
	label: t.String(),
	/** Planning round: 0 before the first plan, then one per replan. */
	round: t.Number(),
	status: NodeStatus,
	startedAt: nullable(t.Number()),
	/** Time spent so far for a running node, in total for a finished one; `null` before it starts. */
	durationMs: nullable(t.Number()),
	detail: NodeDetail,
});

export const RequestEdge = t.Object({
	from: t.String(),
	to: t.String(),
	kind: t.UnionEnum(["next", "replan"]),
});

/** A request ready to draw: prompt → plan → steps with their timings → result. */
export const RequestView = t.Object({
	request: UpstreamRequestDetails.properties.request,
	nodes: t.Array(RequestNode),
	edges: t.Array(RequestEdge),
	/** Server time of this snapshot; a running node's elapsed time is relative to it. */
	now: t.Number(),
});

export type RequestsQuery = Static<typeof RequestsQuery>;
export type RequestStatus = Static<typeof RequestStatus>;
export type RequestSummary = Static<typeof RequestSummary>;
export type RequestsPage = Static<typeof RequestsPage>;
export type UpstreamRequestDetails = Static<typeof UpstreamRequestDetails>;
export type NodeStatus = Static<typeof NodeStatus>;
export type NodeCall = Static<typeof NodeCall>;
export type NodeDetail = Static<typeof NodeDetail>;
export type RequestNode = Static<typeof RequestNode>;
export type RequestEdge = Static<typeof RequestEdge>;
export type RequestView = Static<typeof RequestView>;
