/** World-state fact: the page the visitor is on now — path and query as the browser shows them (no origin, no hash). */
export const PAGE_FACT = "page:path";
/** World-state fact: the interface language of that page ("ru", "en-us"), when the URL says one. */
export const PAGE_LANG_FACT = "page:lang";

type QueryValue = string | string[];

export interface ParsedPage {
	/** Path without language prefix, origin, hash or trailing slash. */
	path: string;
	/** Language from the path (`/ru/…`) or the `lang`/`locale` parameter, lowercased with `-`. */
	lang?: string;
	/** Parameters that identify the page; language and tracking parameters are left out. */
	query: Record<string, QueryValue>;
}

/** `/ru/…`, `/en-US/…`: two letters, optional region, then a segment boundary. */
const PATH_LANG = /^\/([a-z]{2})(?:[-_]([a-z]{2,4}))?(?=\/|$)/i;
const LANG_PARAMS = new Set(["lang", "locale", "language", "hl"]);
const IGNORED_PARAMS = /^(utm_.+|gclid|fbclid|yclid|ref)$/i;

const asLang = (value: string) => value.toLowerCase().replace("_", "-");

/**
 * Splits a page URL (or path) into what identifies the page and the language
 * it is shown in. Sites carry the language in the path (`/ru/store`), in a
 * parameter (`?lang=ru`) or not at all, and add tracking parameters — none of
 * that is a different page. `undefined` for an empty value.
 *
 * The language-in-path rule is a heuristic (a real two-letter route would be
 * read as a language); it is applied to both sides of every comparison, so
 * `samePage` stays consistent even then.
 */
export function parsePage(value: string): ParsedPage | undefined {
	if (!value.trim()) return undefined;
	let url: URL;
	try {
		url = new URL(value, "http://page.local");
	} catch {
		return undefined;
	}

	let path = url.pathname;
	let lang: string | undefined;
	const prefix = path.match(PATH_LANG);
	if (prefix) {
		lang = asLang(
			prefix[2] ? `${prefix[1]}-${prefix[2]}` : (prefix[1] as string),
		);
		path = path.slice(prefix[0].length) || "/";
	}
	if (path.length > 1) path = path.replace(/\/+$/, "");

	const query: Record<string, QueryValue> = {};
	for (const [key, raw] of url.searchParams) {
		if (LANG_PARAMS.has(key.toLowerCase())) {
			lang ??= asLang(raw);
			continue;
		}
		if (IGNORED_PARAMS.test(key)) continue;
		const known = query[key];
		query[key] =
			known === undefined
				? raw
				: Array.isArray(known)
					? [...known, raw]
					: [known, raw];
	}
	return lang ? { path, lang, query } : { path, query };
}

const valuesOf = (value: QueryValue) =>
	Array.isArray(value) ? value : [value];

/**
 * Whether going to `target` would leave the visitor where they already are:
 * same path (language prefix ignored) and every parameter the target names is
 * present on the current page with the same value(s), in any order. A target
 * without parameters matches the path with any parameters — the visitor on
 * `/store/a?q=milk` does not need sending to `/store/a`.
 */
export function samePage(current: string | undefined, target: string): boolean {
	const here = current === undefined ? undefined : parsePage(current);
	const there = parsePage(target);
	if (!here || !there || here.path !== there.path) return false;
	return Object.entries(there.query).every(([key, wanted]) => {
		const present = here.query[key];
		if (present === undefined) return false;
		const have = [...valuesOf(present)].sort();
		const want = [...valuesOf(wanted)].sort();
		return have.length === want.length && have.every((v, i) => v === want[i]);
	});
}
