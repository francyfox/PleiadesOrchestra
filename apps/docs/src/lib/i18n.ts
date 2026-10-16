export const DEFAULT_LOCALE = "en" as const;

// Extra locales, prefixed in the URL (e.g. /ru/blog). The default locale is
// unprefixed (/blog). Each has its own route folder (src/routes/ru, …), as SveltePress
// locales expect.
export const LOCALES = ["ru", "kk"] as const;

export type Locale = typeof DEFAULT_LOCALE | (typeof LOCALES)[number];

/** Every locale, default first: language switches and per-locale content maps iterate this. */
export const ALL_LOCALES: readonly Locale[] = [DEFAULT_LOCALE, ...LOCALES];

/** Prefix a site path with the locale (none for the default one) and add the trailing slash
 *  the static build serves pages under. `path` starts with `/`. */
export function localizeHref(path: string, locale: string | undefined): string {
	const href =
		!locale || locale === DEFAULT_LOCALE ? path : `/${locale}${path}`;
	return href.endsWith("/") ? href : `${href}/`;
}

/** The locale a path is under: its first segment when that is a locale, else the default. */
export function localeFromPath(pathname: string): Locale {
	const first = pathname.split("/")[1];
	return LOCALES.find((locale) => locale === first) ?? DEFAULT_LOCALE;
}
