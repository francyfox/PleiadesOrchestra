export const DEFAULT_LOCALE = "en" as const;

// Extra locales, prefixed in the URL (e.g. /ru/blog). The default locale is
// unprefixed (/blog) and content-only translations are managed via Sveltia CMS.
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
