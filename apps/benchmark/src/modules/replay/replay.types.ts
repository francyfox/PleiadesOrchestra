/** One model call of an orchestrator run as `bun efficiency` saved it (from `/v1/admin/requests`). */
export interface RecordedCall {
	/** `alpha-understand`, `generateReply`, `classify`, or the tool a delta call filled (`search_products`). */
	actionName?: string;
	model: string;
	latencyMs: number;
	/** The chat messages as JSON; `null` for a decision (gamma) or code step: not replayed. */
	prompt: string | null;
	outputTokens: number | null;
	/** The model's raw answer. */
	response?: string | null;
}

/** One case run of `<run folder>/orchestra/<n>-<case>.json`. */
export interface RecordedRun {
	id: string;
	iteration?: number;
	ok: boolean;
	status?: string;
	latencyMs: number;
	detail: { llmCalls: RecordedCall[] };
}

/** A call to replay: which run and which of its calls (`run` = file name). */
export interface ReplayCall extends RecordedCall {
	run: string;
	index: number;
}
