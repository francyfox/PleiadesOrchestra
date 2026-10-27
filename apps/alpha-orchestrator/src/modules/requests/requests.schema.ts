import { t } from "elysia";
import { PageQuery } from "../http/http.ts";

// Literals spelled out: `oneOf()` loses the literal types, which breaks handler typing.
const RequestStatus = t.Union([
	t.Literal("running"),
	t.Literal("waiting"),
	t.Literal("succeeded"),
	t.Literal("failed"),
	t.Literal("abandoned"),
	t.Literal("interrupted"),
	t.Literal("cancelled"),
]);

/** Paging plus optional filters (`oneOf`, not `t.UnionEnum`: an omitted field must stay undefined). */
export const RequestsQuery = t.Composite([
	PageQuery,
	t.Object({
		status: t.Optional(RequestStatus),
		intent: t.Optional(t.String({ minLength: 1, maxLength: 64 })),
		ownerId: t.Optional(t.String({ minLength: 1 })),
	}),
]);

export const RequestParams = t.Object({ id: t.String() });

/** One row of the requests table: a user message and what became of it. */
export const RequestSummary = t.Object({
	/** Id of the request's first run. */
	id: t.String(),
	visitorId: t.String(),
	threadId: t.String(),
	/** The user message, cut to 200 characters. */
	prompt: t.Nullable(t.String()),
	/** What the message was classified as, if it got that far. */
	intent: t.Nullable(t.String()),
	status: RequestStatus,
	/** Actions in the order they finished, plus the one the browser is running now. */
	steps: t.Array(t.String()),
	/** Runs the request took: one per browser round trip, plus the first. */
	runs: t.Number(),
	startedAt: t.Number(),
	durationMs: t.Number(),
});

export const RequestsPage = t.Object({
	items: t.Array(RequestSummary),
	total: t.Number(),
});

/** A stored trace event with `type`/`attempt`/`action`/`at` lifted out of the payload. */
const RequestEvent = t.Object({
	seq: t.Number(),
	type: t.String(),
	attempt: t.Number(),
	action: t.Nullable(t.String()),
	/** Loose JSON, shape depends on `type`. */
	payload: t.Record(t.String(), t.Unknown()),
	at: t.Number(),
});

const RequestRun = t.Object({
	id: t.String(),
	createdAt: t.Number(),
	durationMs: t.Number(),
	succeeded: t.Boolean(),
	/** Still executing: `events` are the ones seen so far. */
	running: t.Boolean(),
	events: t.Array(RequestEvent),
});

const RequestLlmCall = t.Object({
	planRunId: t.Nullable(t.String()),
	actionName: t.Nullable(t.String()),
	kind: t.String(),
	provider: t.String(),
	model: t.String(),
	inputTokens: t.Nullable(t.Number()),
	outputTokens: t.Nullable(t.Number()),
	latencyMs: t.Number(),
	ok: t.Boolean(),
	error: t.Nullable(t.String()),
	choices: t.Nullable(
		t.Array(
			t.Object({
				question: t.String(),
				chosen: t.Nullable(t.String()),
				options: t.Record(t.String(), t.Number()),
			}),
		),
	),
	at: t.Number(),
});

/** The whole chain of one request: prompt, runs with trace events, model calls, answer. */
export const RequestDetails = t.Object({
	request: t.Object({
		id: t.String(),
		visitorId: t.String(),
		threadId: t.String(),
		prompt: t.Nullable(t.String()),
		intent: t.Nullable(t.String()),
		status: RequestStatus,
		/** World state the first plan aimed for (loose JSON). */
		goal: t.Record(t.String(), t.Unknown()),
		/** The assistant's answer, while its message is still stored. */
		reply: t.Nullable(t.String()),
		startedAt: t.Number(),
		durationMs: t.Number(),
	}),
	runs: t.Array(RequestRun),
	llmCalls: t.Array(RequestLlmCall),
	/** Server time of this answer, so a client can count up the running step. */
	now: t.Number(),
});
