export interface IncomingMessage {
	/** Opaque per-conversation id, scoped by the adapter (e.g. Telegram chat id). */
	threadId: string;
	userId: string;
	text: string;
}

export interface OutgoingMessage {
	text: string;
}

/** Port implemented by the core, called by every transport adapter. */
export interface Agent {
	handleMessage(message: IncomingMessage): Promise<OutgoingMessage>;
	resetThread(threadId: string): void;
}
