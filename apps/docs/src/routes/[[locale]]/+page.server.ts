import { LOCALES } from "#lib/i18n.js";
import type { EntryGenerator } from "./$types";

// Prerender the unprefixed (en) landing and one per extra locale; '' omits the optional [[locale]] param.
export const entries: EntryGenerator = () => {
	return ["", ...LOCALES].map((locale) => ({ locale }));
};
