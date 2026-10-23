/**
 * How the shop's word rules are put together. The rules themselves are one file per
 * language (`shop.cues.en.ts`, `shop.cues.ru.ts`); a language is added by a new file and
 * one line in `shop.message-cues.ts`. What is shared is only the ORDER of the slots (who
 * outranks whom) and the matching.
 */

/** `(?<![\p{L}\p{N}])` — a word must start here (JS `\b` is ASCII-only). */
const START = String.raw`(?<![\p{L}\p{N}])`;
const END = String.raw`(?![\p{L}\p{N}])`;

/** Alternatives that must begin a word; the last one may continue (a stem: endings differ). */
export const stems = (...alternatives: string[]) =>
	`${START}(?:${alternatives.join("|")})`;
/** Whole words/phrases. */
export const words = (...alternatives: string[]) =>
	`${START}(?:${alternatives.join("|")})${END}`;

/**
 * The slots in the order they are asked; the first that matches wins, so the order is the
 * specificity: consequential and narrow intents before broad ones, `chat` last. An intent
 * can have two slots: explicit verbs of buying outrank the words of a filter in the same
 * message («добавь самый дешёвый ноутбук»), the weak ones («хочу», «надо») do not.
 */
export const SLOTS = [
	{ slot: "removeFromCart", intent: "removeFromCart" },
	{ slot: "checkout", intent: "checkout" },
	{ slot: "chooseStore", intent: "chooseStore" },
	{ slot: "select", intent: "select" },
	{ slot: "navigate", intent: "navigate" },
	{ slot: "compare", intent: "compare" },
	{ slot: "paginate", intent: "paginate" },
	{ slot: "search", intent: "search" },
	{ slot: "buy", intent: "addToCart" },
	{ slot: "filter", intent: "filter" },
	{ slot: "wantToBuy", intent: "addToCart" },
	{ slot: "chat", intent: "chat" },
] as const;

export type SlotId = (typeof SLOTS)[number]["slot"];

/** What one language knows: patterns per slot (any may be missing) and how it writes the same text. */
export interface LanguageCues {
	language: string;
	/** Applied to the lower-cased message before this language's patterns (Russian: `ё` is `е`)... */
	normalize?: (text: string) => string;
	/** ...and to the patterns themselves, so a pattern spelled with `ё` still meets the folded text. */
	normalizePattern?: (pattern: string) => string;
	slots: Partial<Record<SlotId, string[]>>;
	/** «All of them» («удали всё», «remove everything»): a removal for every item of a list. */
	allOfThem: string[];
}

const compile = (language: LanguageCues, patterns: string[]) => {
	const joined = patterns.join("|");
	return new RegExp(language.normalizePattern?.(joined) ?? joined, "iu");
};

/** The rules of the given languages as one classifier; a language only adds patterns. */
export function composeCues(languages: LanguageCues[]) {
	const normalized = (language: LanguageCues, message: string) =>
		language.normalize
			? language.normalize(message.toLowerCase())
			: message.toLowerCase();

	const bySlot = SLOTS.map(({ slot, intent }) => ({
		intent,
		rules: languages.flatMap((language) => {
			const patterns = language.slots[slot];
			return patterns?.length
				? [{ language, regex: compile(language, patterns) }]
				: [];
		}),
	}));
	const all = languages.map((language) => ({
		language,
		regex: compile(language, language.allOfThem),
	}));

	return {
		/** The intent the message's own words point to, or `undefined` when no rule claims it (then Laya decides). */
		intentFromCues(message: string): string | undefined {
			for (const { intent, rules } of bySlot) {
				for (const { language, regex } of rules) {
					if (regex.test(normalized(language, message))) return intent;
				}
			}
			return undefined;
		},
		/** A removal that says it is for every item of a list. Only meaningful next to a `removeFromCart` message. */
		asksForAll(message: string): boolean {
			return all.some(({ language, regex }) =>
				regex.test(normalized(language, message)),
			);
		},
	};
}
