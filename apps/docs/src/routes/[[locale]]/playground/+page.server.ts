import { LOCALES } from "#lib/i18n.js";
import type { EntryGenerator } from "./$types";

export const entries: EntryGenerator = () => {
	return ["", ...LOCALES].map((locale) => ({ locale }));
};
