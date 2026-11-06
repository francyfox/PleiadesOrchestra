import { derived } from "svelte/store";
import { useLocale } from "svelte-intlayer";
import { createFormat } from "./format";
import { timeZone } from "./time-zone";

/** Formatters bound to the current locale and the account's time zone, as a store: `$format.number(n)`. */
export function useFormat() {
	const { locale } = useLocale();
	return derived([locale, timeZone], ([$locale, $zone]) =>
		createFormat($locale, $zone),
	);
}
