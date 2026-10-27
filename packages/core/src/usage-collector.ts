import { AsyncLocalStorage } from "node:async_hooks";
import type { DecisionAgent } from "./decision-types";
import type { DecisionChoice } from "./types";

export interface CollectedTokens {
	inputTokens?: number;
	outputTokens?: number;
	/** Choice questions answered inside the scope, in order (`withChoiceReport`); undefined when none. */
	choices?: DecisionChoice[];
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

/**
 * The decision agent that also reports each choice answer with all its
 * probabilities to the surrounding `collectTokens`. Wrap the outermost agent so
 * the keys are the callers' own and the probabilities the calibrated ones.
 */
export function withChoiceReport(agent: DecisionAgent): DecisionAgent {
	return {
		async decide(state, questions) {
			const answers = await agent.decide(state, questions);
			const into = collectors.getStore();
			if (into) {
				const choices = Object.entries(answers).flatMap(([question, answer]) =>
					answer.type === "choice"
						? [
								{
									question,
									chosen: answer.choice ?? null,
									options: answer.probabilities ?? {},
								},
							]
						: [],
				);
				if (choices.length > 0)
					into.choices = [...(into.choices ?? []), ...choices];
			}
			return answers;
		},
	};
}
