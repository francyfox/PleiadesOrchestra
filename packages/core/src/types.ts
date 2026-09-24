import type { ModelMessage } from "ai";

export interface IncomingMessage {
	/** Opaque per-conversation id, scoped by the adapter (e.g. Telegram chat id). */
	threadId: string;
	userId: string;
	/** GOAP run this call belongs to, if any — threaded into `HistoryStore`/`UsageRecorder` records. */
	planRunId?: string;
	/** GOAP action name that issued this call, if any. */
	actionName?: string;
	/**
	 * Already-normalized text, pre-split by the transport layer into chunks
	 * that fit the model's context budget. A short message is a single-element
	 * array — chunking is what lets a message larger than the context window
	 * get processed instead of overflowing or erroring out.
	 */
	chunks: string[];
}

/**
 * Emitted while a chunked message is being processed. `progress` fires once
 * per chunk (including lightweight "ingest" passes for all but the last
 * chunk) so a transport can show real progress instead of a bare spinner.
 * `delta` only fires for the final chunk, once actual answer generation
 * starts streaming.
 */
export type AgentStreamEvent =
	| {
			type: "progress";
			chunkIndex: number;
			totalChunks: number;
			elapsedMs: number;
			contextChars: number;
	  }
	| { type: "delta"; text: string }
	| {
			type: "done";
			/** Time spent on the final generation call only — excludes any earlier ingest-chunk passes. */
			elapsedMs: number;
			inputTokens?: number;
			outputTokens?: number;
			/** Sum over every model call made for this message (ingest passes + final generation). `undefined` if any call didn't report usage. */
			totalInputTokens?: number;
			totalOutputTokens?: number;
	  };

/** Port implemented by the core, called by every transport adapter. */
export interface Agent {
	handleMessageStream(
		message: IncomingMessage,
	): AsyncIterable<AgentStreamEvent>;
	resetThread(threadId: string): Promise<void>;
}

/** Who a model call / history write belongs to. Threaded from `IncomingMessage`. */
export interface CallContext {
	threadId: string;
	userId: string;
	planRunId?: string;
	actionName?: string;
}

/**
 * Port for conversation history. `packages/core` ships an in-memory
 * implementation; persistent ones (SQLite) live in the app that owns the DB.
 */
export interface HistoryStore {
	/** Most recent messages of the thread, oldest first, at most `limit`. */
	get(threadId: string, limit: number): Promise<ModelMessage[]>;
	append(ctx: CallContext, messages: ModelMessage[]): Promise<void>;
	reset(threadId: string): Promise<void>;
}

export type LlmCallKind = "ingest" | "generate" | "decision";

/** One model call. Token fields are `undefined` when the provider didn't report usage — never coerce to 0. */
export interface LlmCallRecord extends CallContext {
	kind: LlmCallKind;
	provider: string;
	model: string;
	inputTokens?: number;
	outputTokens?: number;
	latencyMs: number;
	ok: boolean;
	error?: string;
	/** Epoch ms when the call finished. */
	at: number;
}

/** Port called once per model call (including ingest passes). Sync on purpose: adapters buffer and flush themselves. */
export interface UsageRecorder {
	record(call: LlmCallRecord): void;
}
