import { PAGE_LANG_FACT } from "./page";
import type { WorldState } from "./types";

export type StepLanguage = "ru" | "en";

/**
 * The language progress text is written in, from the page's language: Russian
 * (and Kazakh, whose readers read Russian) or English; no page language means
 * Russian, the default of the product.
 */
export function stepLanguage(state: WorldState): StepLanguage {
	const lang = state[PAGE_LANG_FACT];
	if (typeof lang !== "string") return "ru";
	return lang.startsWith("ru") || lang.startsWith("kk") ? "ru" : "en";
}

/** Picks the text for the state's language. */
export function say<T = string>(
	state: WorldState,
	text: Record<StepLanguage, T>,
): T {
	return text[stepLanguage(state)];
}

/** A fact as text for a sentence, or `fallback` when it isn't a plain value. */
export function fact(state: WorldState, key: string, fallback = ""): string {
	const value = state[key];
	return typeof value === "string" || typeof value === "number"
		? String(value)
		: fallback;
}
