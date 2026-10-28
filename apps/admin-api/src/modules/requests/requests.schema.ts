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
	"interrupted",
	"cancelled",
] as const;

export const RequestStatus = t.UnionEnum(REQUEST_STATUSES);

/** Paging plus optional filters; an omitted filter means "all". */
export const RequestsQuery = t.Composite([
	PageQuery,
	t.Object({
		status: t.Optional(oneOf(REQUEST_STATUSES)),
		intent: t.Optional(t.String({ minLength: 1, maxLength: 64 })),
		/** Staff only: one account's channels. A user is always scoped to their own. */
		ownerId: t.Optional(t.String({ minLength: 1 })),
	}),
]);

/** One row of the requests table: a user message and what became of it. */
export const RequestSummary = t.Object({
	id: t.String(),
	visitorId: t.String(),
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

/** One choice question a decision call answered: every option with its probability. */
export const CallChoice = t.Object({
	question: t.String(),
	chosen: nullable(t.String()),
	options: t.Record(t.String(), t.Number()),
	/** What was asked: the state the model read, the instructions, each option's text. */
	state: t.Optional(t.Unknown()),
	instructions: t.Optional(t.String()),
	criteria: t.Optional(t.Record(t.String(), t.String())),
	round: t.Optional(t.String()),
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
	choices: t.Optional(nullable(t.Array(CallChoice))),
	prompt: t.Optional(nullable(t.String())),
	response: t.Optional(nullable(t.String())),
	attempts: t.Optional(nullable(t.Number())),
	failedStatuses: t.Optional(nullable(t.Array(t.Number()))),
	at: t.Number(),
});

export const UpstreamRequestDetails = t.Object({
	request: t.Object({
		id: t.String(),
		visitorId: t.String(),
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
	"classify",
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
	/** Every choice the call answered with all its probabilities; null for calls that decide nothing. */
	choices: nullable(t.Array(CallChoice)),
	/** What was sent (JSON `[{role, content}]`) and the raw answer; null when not kept. */
	prompt: nullable(t.String()),
	response: nullable(t.String()),
	/** HTTP attempts the call took and the status of each failed one (0 = no response); null = not measured. */
	attempts: nullable(t.Number()),
	failedStatuses: nullable(t.Array(t.Number())),
});

/** What alpha-understand read: the message in English and its tasks. */
export const Understood = t.Object({
	en: t.String(),
	tasks: t.Array(
		t.Object({
			intent: t.String(),
			text: t.String(),
			items: t.Array(t.Object({ name: t.String(), quantity: t.Number() })),
			attributes: t.Array(t.Object({ name: t.String(), value: t.String() })),
		}),
	),
});

/** The plan the planner chose, and the actions it could have used instead. */
export const NodePlan = t.Object({
	steps: t.Array(t.Object({ name: t.String(), cost: t.Number() })),
	totalCost: t.Number(),
	alternatives: t.Array(
		t.Object({ name: t.String(), cost: t.Number(), why: t.String() }),
	),
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
	/** Facts this step changed in the world state; `before` is null for a fact that was not there. */
	changes: nullable(
		t.Array(
			t.Object({
				key: t.String(),
				before: nullable(t.Union([t.Boolean(), t.Number(), t.String()])),
				after: t.Union([t.Boolean(), t.Number(), t.String()]),
			}),
		),
	),
	/** The plan chosen at the start of this node's round (understand node: the first plan; a replan: the round's first step). */
	plan: nullable(NodePlan),
	error: nullable(t.String()),
	/** The understand node only: alpha-understand's answer, parsed. */
	understood: nullable(Understood),
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
export type CallChoice = Static<typeof CallChoice>;
export type NodeCall = Static<typeof NodeCall>;
export type Understood = Static<typeof Understood>;
export type NodePlan = Static<typeof NodePlan>;
export type NodeDetail = Static<typeof NodeDetail>;
export type RequestNode = Static<typeof RequestNode>;
export type RequestEdge = Static<typeof RequestEdge>;
export type RequestView = Static<typeof RequestView>;
