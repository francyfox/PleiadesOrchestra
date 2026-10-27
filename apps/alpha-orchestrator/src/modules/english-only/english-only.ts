import {
	type DecisionAgent,
	type DecisionAnswer,
	type DecisionQuestion,
	type DecisionState,
	UntranslatableError,
} from "@repo/core";
import { LruMap } from "../lru-map/lru-map.ts";

/** Any letter that is not Latin: the string is not (only) English. */
const NOT_ENGLISH = /(?!\p{Script=Latin})\p{L}/u;

export { UntranslatableError };

export interface EnglishOnlyOptions {
	/** Strings → English, same order (alpha-understand); a throw, a wrong count, an empty or still non-English answer, or no translator at all means "cannot translate". */
	translate?: (texts: string[]) => Promise<string[]>;
	/** Most translated strings kept (tool descriptions, enum values: static per site). */
	cacheSize?: number;
}

/**
 * Wraps the `DecisionAgent` port so that nothing but English reaches Laya:
 * every string with non-Latin letters in the state, the instructions and the
 * criteria is translated first, all of a call in one batch.
 *
 * Criteria KEYS are the options Laya reads, so a non-Latin key (a Russian store
 * name) is sent as its translation, not as an opaque id: descriptions are often
 * `null`, and an id like `o1` would leave Laya nothing to read. Two keys that
 * translate alike get a numeric suffix; the answer and its probabilities are
 * mapped back to the callers' original keys.
 *
 * When a string cannot be translated the call is NOT made: `UntranslatableError`
 * is thrown and each caller falls back (intent: words/chat, tool catalog: not
 * registered yet, parameter choice: first option).
 */
export function withEnglishOnly(
	agent: DecisionAgent,
	options: EnglishOnlyOptions,
): DecisionAgent {
	const cache = new LruMap<string, string>({
		maxEntries: options.cacheSize ?? 1000,
	});

	/** Every string of a call that is not English yet, translated in one batch into the cache. */
	async function prefetch(
		state: DecisionState,
		questions: Record<string, DecisionQuestion>,
	) {
		const missing = new Set<string>();
		const collect = (value: unknown) => {
			if (typeof value === "string") {
				if (NOT_ENGLISH.test(value) && !cache.has(value)) missing.add(value);
			} else if (Array.isArray(value)) value.forEach(collect);
			else if (value && typeof value === "object") {
				const { type, criteria } = value as {
					type?: unknown;
					criteria?: object;
				};
				if (type === "choice" && criteria)
					Object.keys(criteria).forEach(collect);
				Object.values(value).forEach(collect);
			}
		};
		collect(state);
		collect(Object.values(questions));
		if (missing.size === 0) return;
		const texts = [...missing];
		let out: string[] = [];
		try {
			out = options.translate ? await options.translate(texts) : [];
		} catch {
			out = [];
		}
		// A translation that still has Russian in it (a model that left a word as is) is not English either.
		texts.forEach((text, i) => {
			const translated = out[i]?.trim();
			if (translated && !NOT_ENGLISH.test(translated))
				cache.set(text, translated);
		});
	}

	async function english(text: string): Promise<string> {
		if (!NOT_ENGLISH.test(text)) return text;
		const translated = cache.get(text);
		if (translated === undefined) throw new UntranslatableError(text);
		return translated;
	}

	async function deep<T>(value: T): Promise<T> {
		if (typeof value === "string") return (await english(value)) as T;
		if (Array.isArray(value)) {
			return (await Promise.all(value.map((item) => deep(item)))) as T;
		}
		if (value && typeof value === "object") {
			const entries = await Promise.all(
				Object.entries(value).map(
					async ([key, item]) => [key, await deep(item)] as const,
				),
			);
			return Object.fromEntries(entries) as T;
		}
		return value;
	}

	/** Question in English, plus the map from the keys Laya sees back to the original ones. */
	async function questionEn(
		question: DecisionQuestion,
	): Promise<{ question: DecisionQuestion; back: Map<string, string> }> {
		const back = new Map<string, string>();
		if (question.type !== "choice") {
			return { question: await deep(question), back };
		}
		const instructions = await deep(question.instructions);
		const criteria: Record<string, unknown> = {};
		for (const [key, description] of Object.entries(question.criteria)) {
			let sent = await english(key);
			for (let n = 2; sent in criteria; n++)
				sent = `${await english(key)} ${n}`;
			criteria[sent] = await deep(description);
			back.set(sent, key);
		}
		return {
			question: { ...question, instructions, criteria } as DecisionQuestion,
			back,
		};
	}

	function answerBack(
		answer: DecisionAnswer,
		back: Map<string, string>,
	): DecisionAnswer {
		if (answer.type !== "choice" || back.size === 0) return answer;
		return {
			...answer,
			choice: back.get(answer.choice) ?? answer.choice,
			...(answer.probabilities
				? {
						probabilities: Object.fromEntries(
							Object.entries(answer.probabilities).map(([key, p]) => [
								back.get(key) ?? key,
								p,
							]),
						),
					}
				: {}),
		} as DecisionAnswer;
	}

	return {
		async decide(
			state: DecisionState,
			questions: Record<string, DecisionQuestion>,
		) {
			await prefetch(state, questions);
			const stateEn = await deep(state);
			const prepared = await Promise.all(
				Object.entries(questions).map(
					async ([id, question]) => [id, await questionEn(question)] as const,
				),
			);
			const answers = await agent.decide(
				stateEn,
				Object.fromEntries(prepared.map(([id, p]) => [id, p.question])),
			);
			const backOf = new Map(prepared.map(([id, p]) => [id, p.back]));
			return Object.fromEntries(
				Object.entries(answers).map(([id, answer]) => [
					id,
					answerBack(answer, backOf.get(id) ?? new Map()),
				]),
			);
		},
	};
}
