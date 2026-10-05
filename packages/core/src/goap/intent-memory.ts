import type { MessageIntent } from "./message-intent.ts";

/**
 * What a site has taught the classifier: messages (in English) a person
 * approved, each with the intent they stand for. The model built from them
 * answers the same questions Laya is asked, in microseconds; where it is not
 * sure it says nothing and Laya is asked as before. Nothing here is written
 * by hand for a particular shop — a new site starts with no examples and
 * learns its own words.
 */
export interface IntentExample {
	text: string;
	intent: MessageIntent;
}

export interface IntentHit {
	intent: MessageIntent;
	/** `exact`: this very text was approved; `model`: a phrase of known words. */
	via: "exact" | "model";
	/** 1 for an exact hit, else the winner's share of the probability. */
	confidence: number;
}

export interface IntentModel {
	classify(text: string): IntentHit | undefined;
}

/**
 * Intents with a side effect that must be asked for in so many words (see
 * `message-intent.ts`): never answered from memory, so a wrong example can't
 * start a payment or empty a cart.
 */
const NEVER_FROM_MEMORY: ReadonlySet<MessageIntent> = new Set([
	"checkout",
	"removeFromCart",
]);

/** The model must be this sure of the winner, or it stays silent. */
const MIN_CONFIDENCE = 0.85;
/** Fewer known words than this is not enough to judge a phrase. */
const MIN_KNOWN_WORDS = 1;

/** Lowercase letters and digits of any script, single-spaced — the key of an example. */
export function normalizeIntentText(text: string): string {
	return text
		.toLowerCase()
		.replace(/[^\p{L}\p{N}]+/gu, " ")
		.trim();
}

const wordsOf = (normalized: string) =>
	normalized === "" ? [] : normalized.split(" ");

/**
 * Exact lookup first, then naive Bayes over words with add-one smoothing.
 * Small on purpose: a site has hundreds of examples, and a model that can be
 * rebuilt in a millisecond whenever a person approves or corrects one needs
 * no training step.
 */
export function createIntentModel(examples: IntentExample[]): IntentModel {
	const exact = new Map<string, MessageIntent>();
	const perIntent = new Map<
		MessageIntent,
		{ examples: number; words: Map<string, number>; total: number }
	>();
	const vocabulary = new Set<string>();

	// Later examples replace earlier ones for the same text: a correction wins.
	for (const example of examples) {
		exact.set(normalizeIntentText(example.text), example.intent);
	}
	for (const [text, intent] of exact) {
		const stats = perIntent.get(intent) ?? {
			examples: 0,
			words: new Map(),
			total: 0,
		};
		stats.examples++;
		for (const word of wordsOf(text)) {
			stats.words.set(word, (stats.words.get(word) ?? 0) + 1);
			stats.total++;
			vocabulary.add(word);
		}
		perIntent.set(intent, stats);
	}
	const totalExamples = exact.size;

	return {
		classify(text) {
			const key = normalizeIntentText(text);
			const known = exact.get(key);
			if (known !== undefined) {
				return NEVER_FROM_MEMORY.has(known)
					? undefined
					: { intent: known, via: "exact", confidence: 1 };
			}

			const words = wordsOf(key).filter((word) => vocabulary.has(word));
			if (words.length < MIN_KNOWN_WORDS || totalExamples === 0) {
				return undefined;
			}
			const scores: [MessageIntent, number][] = [];
			for (const [intent, stats] of perIntent) {
				let score = Math.log(stats.examples / totalExamples);
				for (const word of words) {
					score += Math.log(
						((stats.words.get(word) ?? 0) + 1) /
							(stats.total + vocabulary.size),
					);
				}
				scores.push([intent, score]);
			}
			const best = Math.max(...scores.map(([, score]) => score));
			const weights = scores.map(
				([intent, score]) => [intent, Math.exp(score - best)] as const,
			);
			const sum = weights.reduce((total, [, weight]) => total + weight, 0);
			const [winner, weight] = weights.reduce((a, b) => (b[1] > a[1] ? b : a));
			const confidence = weight / sum;
			if (confidence < MIN_CONFIDENCE || NEVER_FROM_MEMORY.has(winner)) {
				return undefined;
			}
			return { intent: winner, via: "model", confidence };
		},
	};
}
