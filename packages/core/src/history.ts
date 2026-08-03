import type { ModelMessage } from "ai";

/**
 * Bounded in-memory conversation history, keyed by thread.
 *
 * Capped by message count rather than tokens: the model here has a small,
 * fixed context budget, so history depth must stay predictable regardless
 * of provider-side prompt bloat.
 */
export class ThreadHistory {
	private readonly threads = new Map<string, ModelMessage[]>();

	constructor(private readonly maxMessages: number) {}

	get(threadId: string): ModelMessage[] {
		return this.threads.get(threadId) ?? [];
	}

	append(threadId: string, ...messages: ModelMessage[]): void {
		const existing = this.threads.get(threadId) ?? [];
		const updated = [...existing, ...messages].slice(-this.maxMessages);
		this.threads.set(threadId, updated);
	}

	reset(threadId: string): void {
		this.threads.delete(threadId);
	}
}
