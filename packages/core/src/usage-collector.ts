import { AsyncLocalStorage } from "node:async_hooks";

export interface CollectedTokens {
	inputTokens?: number;
	outputTokens?: number;
}

const collectors = new AsyncLocalStorage<CollectedTokens>();

const sum = (a: number | undefined, b: number | undefined) =>
	a === undefined && b === undefined ? undefined : (a ?? 0) + (b ?? 0);

/**
 * Runs `fn` and returns the tokens every decision model call inside it
 * reported (rounds and retries add up). `DecisionAgent.decide` returns only
 * answers, so the exact `usage` of the model travels beside them: undefined
 * when no call reported any, never 0.
 */
export async function collectTokens<T>(
	fn: () => Promise<T>,
): Promise<{ value: T; tokens: CollectedTokens }> {
	const tokens: CollectedTokens = {};
	const value = await collectors.run(tokens, fn);
	return { value, tokens };
}

/** Called by a model adapter with the provider's own usage; a no-op outside `collectTokens`. */
export function reportTokens(usage: CollectedTokens): void {
	const into = collectors.getStore();
	if (!into) return;
	into.inputTokens = sum(into.inputTokens, usage.inputTokens);
	into.outputTokens = sum(into.outputTokens, usage.outputTokens);
}
