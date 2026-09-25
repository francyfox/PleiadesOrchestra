import { derived } from "svelte/store";
import { useLocale } from "svelte-intlayer";
import { createFormat } from "./format";

/** Formatters bound to the current locale, as a store: `$format.number(n)`. */
export function useFormat() {
	const { locale } = useLocale();
	return derived(locale, ($locale) => createFormat($locale));
}
