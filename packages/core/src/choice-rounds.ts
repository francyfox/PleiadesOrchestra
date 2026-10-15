import type { DecisionAgent, DecisionState } from "./decision-types";

/**
 * Laya shares ONE budget between all options of a `choice` question
 * (`head_max_len` = 192 tokens on the English checkpoint, laya_config.json):
 * over it, every option is silently cut to an equal share and the
 * instructions to what is left. And from 11 options on the probabilities
 * are scaled with a temperature of 0.1 (`temperature_by_options`) that
 * saturates them. So a big question is asked in rounds: the winner of a
 * round simply joins the next round's options.
 */
export const LAYA_HEAD_TOKENS = 192;
/** Up to 10 options Laya's own calibrated temperature (≈1.0) applies. */
export const LAYA_CALIBRATED_OPTIONS = 10;

/**
 * Core has no tokenizer, so tokens are estimated from characters. Measured
 * once against the real Laya tokenizer (tokenizer.json of laya-onnx) on the
 * rendered intent options (`key: description`): 3.3-4.7 chars per token,
 * 4.2 on average; the lowest are camelCase keys ("addToCart: ..."). 3.5
 * keeps a margin over a whole question: the 10-option message-intent question
 * is 143 real tokens and estimated at ~185 (at 3 it was estimated at 214 and
 * split into a needless second call).
 */
export const CHARS_PER_TOKEN = 3.5;

export function estimateTokens(text: string): number {
	return Math.ceil(text.length / CHARS_PER_TOKEN);
}

/** Laya renders an option as `key: description` after a `[MASK]` marker. */
function optionTokens(key: string, description: string): number {
	return 1 + estimateTokens(description ? `${key}: ${description}` : key);
}

/** `[CLS] choice question: <instructions> [SEP]`. */
function headTokens(instructions: string): number {
	return 2 + estimateTokens(`choice question: ${instructions}`);
}

export interface ChoiceRoundsOptions {
	instructions: string;
	/** Ordered: related options near each other end up in the same round. */
	criteria: Record<string, string>;
	maxOptions?: number;
	tokenBudget?: number;
	/** Key of the question on the wire (the answer comes back under it). Default `choice`. */
	questionKey?: string;
	/** Where the previous winner goes in the next round. */
	carry?: "first" | "last";
}

/**
 * The options each round adds (never the carried winner, which takes one
 * slot of every round after the first and is reserved at the cost of the
 * longest option). Every round gets at least one new option, so it always ends.
 */
export function planChoiceRounds(options: ChoiceRoundsOptions): string[][] {
	const maxOptions = options.maxOptions ?? LAYA_CALIBRATED_OPTIONS;
	const budget =
		(options.tokenBudget ?? LAYA_HEAD_TOKENS) -
		headTokens(options.instructions);
	const entries = Object.entries(options.criteria);
	const costs = entries.map(([key, text]) => optionTokens(key, text));
	const carriedCost = Math.max(0, ...costs);

	const rounds: string[][] = [];
	let index = 0;
	while (index < entries.length) {
		const first = rounds.length === 0;
		let used = first ? 0 : carriedCost;
		let count = first ? 0 : 1;
		const fresh: string[] = [];
		while (index < entries.length) {
			const cost = costs[index] as number;
			const fits = count < maxOptions && used + cost <= budget;
			if (!fits && fresh.length > 0) break;
			fresh.push((entries[index] as [string, string])[0]);
			used += cost;
			count++;
			index++;
		}
		rounds.push(fresh);
	}
	return rounds;
}

export interface ChoiceRound {
	options: string[];
	/** Undefined when the model answered nothing usable. */
	choice?: string;
	/** The winner's probability, when the model returned them. */
	probability?: number;
}

export interface ChoiceRoundsResult {
	/** The last round's winner; undefined when a round gave no usable answer. */
	choice?: string;
	/** The lowest winner probability over the rounds (a chain is as sure as its weakest link); undefined when one round returned none. */
	probability?: number;
	rounds: ChoiceRound[];
}

/**
 * Asks a choice question in rounds (sequentially: the next one needs the
 * winner). A question that fits is one call, exactly like a plain `decide`.
 * A failing call propagates to the caller.
 */
export async function decideInRounds(
	agent: DecisionAgent,
	state: DecisionState,
	options: ChoiceRoundsOptions,
): Promise<ChoiceRoundsResult> {
	const plan = planChoiceRounds(options);
	const carry = options.carry ?? "last";
	const questionKey = options.questionKey ?? "choice";
	const rounds: ChoiceRound[] = [];
	let winner: string | undefined;
	for (const fresh of plan) {
		const keys =
			winner === undefined
				? fresh
				: carry === "first"
					? [winner, ...fresh]
					: [...fresh, winner];
		const criteria = Object.fromEntries(
			keys.map((key) => [key, options.criteria[key] as string]),
		);
		const answers = await agent.decide(state, {
			[questionKey]: {
				type: "choice",
				instructions: options.instructions,
				criteria,
			},
		});
		const answer = answers[questionKey];
		const picked = answer?.type === "choice" ? answer.choice : undefined;
		const choice =
			picked !== undefined && keys.includes(picked) ? picked : undefined;
		const probability =
			choice !== undefined && answer?.type === "choice"
				? answer.probabilities?.[choice]
				: undefined;
		rounds.push({ options: keys, choice, probability });
		if (choice === undefined) return { choice: undefined, rounds };
		winner = choice;
	}
	const probabilities = rounds.map((round) => round.probability);
	return {
		choice: winner,
		probability: probabilities.every((p) => p !== undefined)
			? Math.min(...(probabilities as number[]))
			: undefined,
		rounds,
	};
}
