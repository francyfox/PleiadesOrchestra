import type { Locale } from "intlayer";
import { resolveLocale } from "./locale";

/**
 * The locale for this browser: Intlayer's cookie (written by the language
 * switcher) → the browser's preferred languages → Russian. Resolved on the
 * client — the panel has no server-side rendering (see `routes/+layout.ts`).
 */
export function resolveBrowserLocale(): Locale {
	return resolveLocale({
		getCookie: (name) => {
			const match = document.cookie
				.split("; ")
				.find((entry) => entry.startsWith(`${name}=`));
			return match ? decodeURIComponent(match.slice(name.length + 1)) : null;
		},
		getHeader: (name) =>
			name.toLowerCase() === "accept-language"
				? navigator.languages.join(",")
				: null,
	});
}
