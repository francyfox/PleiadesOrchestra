import {
	configuration,
	getLocaleFromStorage,
	type Locale,
	localeDetector,
} from "intlayer";

export interface LocaleSource {
	getCookie(name: string): string | null;
	getHeader(name: string): string | null;
}

const { locales, defaultLocale } = configuration.internationalization;

/**
 * The admin's language for this request: the saved choice (Intlayer's
 * locale cookie, written by the switcher) → Accept-Language → Russian.
 */
export function resolveLocale(source: LocaleSource): Locale {
	const stored = getLocaleFromStorage(source);
	if (stored && locales.includes(stored)) return stored;

	const acceptLanguage = source.getHeader("accept-language");
	if (acceptLanguage) {
		const detected = localeDetector(
			{ "accept-language": acceptLanguage },
			locales,
			defaultLocale,
		);
		if (detected && locales.includes(detected)) return detected;
	}
	return defaultLocale;
}
