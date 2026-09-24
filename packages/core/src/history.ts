import type { ModelMessage } from "ai";
import type { CallContext, HistoryStore } from "./types";

/**
 * Bounded in-memory `HistoryStore`, keyed by thread — the default when no
 * persistent store is injected, and the test double for everything else.
 *
 * Capped by message count rather than tokens: the model here has a small,
 * fixed context budget, so history depth must stay predictable regardless
 * of provider-side prompt bloat.
 */
export class InMemoryHistoryStore implements HistoryStore {
	private readonly threads = new Map<string, ModelMessage[]>();

	constructor(private readonly maxMessages: number) {}

	async get(threadId: string, limit: number): Promise<ModelMessage[]> {
		return (this.threads.get(threadId) ?? []).slice(-limit);
	}

	async append(ctx: CallContext, messages: ModelMessage[]): Promise<void> {
		const existing = this.threads.get(ctx.threadId) ?? [];
		const updated = [...existing, ...messages].slice(-this.maxMessages);
		this.threads.set(ctx.threadId, updated);
	}

	async reset(threadId: string): Promise<void> {
		this.threads.delete(threadId);
	}
}
