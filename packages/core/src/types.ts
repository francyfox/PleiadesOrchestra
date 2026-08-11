export interface IncomingMessage {
	/** Opaque per-conversation id, scoped by the adapter (e.g. Telegram chat id). */
	threadId: string;
	userId: string;
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
	  };

/** Port implemented by the core, called by every transport adapter. */
export interface Agent {
	handleMessageStream(
		message: IncomingMessage,
	): AsyncIterable<AgentStreamEvent>;
	resetThread(threadId: string): void;
}
