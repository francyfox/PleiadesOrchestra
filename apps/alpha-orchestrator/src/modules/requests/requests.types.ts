/** Where a request is: executing, paused on the visitor's browser, or over. */
export type RequestStatus =
	| "running"
	| "waiting"
	| "succeeded"
	| "failed"
	| "abandoned";

/** One row of the requests table. */
export interface RequestSummary {
	/** Id of the request's first run. */
	id: string;
	userId: string;
	threadId: string;
	prompt: string | null;
	/** What the message was classified as (`messageIntent`), if it got that far. */
	intent: string | null;
	status: RequestStatus;
	/** Actions in the order they finished, plus the one the browser is running now. */
	steps: string[];
	/** Runs the request took: one per browser round trip, plus the first. */
	runs: number;
	startedAt: number;
	durationMs: number;
}

/** A stored trace event with `type`/`attempt`/`action`/`at` lifted out of the payload. */
export interface StoredEvent {
	seq: number;
	type: string;
	attempt: number;
	action: string | null;
	payload: Record<string, unknown>;
	at: number;
}

export interface RequestRun {
	id: string;
	createdAt: number;
	durationMs: number;
	succeeded: boolean;
	/** Still executing: `events` are the ones seen so far. */
	running: boolean;
	events: StoredEvent[];
}

export interface RequestLlmCall {
	planRunId: string | null;
	actionName: string | null;
	kind: string;
	provider: string;
	model: string;
	inputTokens: number | null;
	outputTokens: number | null;
	latencyMs: number;
	ok: boolean;
	error: string | null;
	at: number;
}

export interface RequestDetails {
	request: Omit<RequestSummary, "steps" | "runs"> & {
		goal: Record<string, unknown>;
		/** The assistant's answer, while its message is still stored. */
		reply: string | null;
	};
	runs: RequestRun[];
	llmCalls: RequestLlmCall[];
	/** Server time of this answer, so a client can count up the running step. */
	now: number;
}
