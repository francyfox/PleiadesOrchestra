/** Longest page string sent to the server — mirrors its `MAX_PAGE_CHARS`. */
export const MAX_PAGE_CHARS = 512;

/**
 * Where the visitor is: `pathname + search` of the page the widget sits on —
 * the language prefix and query parameters included, because they say which
 * page it really is (`/ru/store/a?q=milk`). No origin (the server knows it
 * from the channel) and no `#hash` (never sent to servers by browsers either,
 * and often holds private state). Cut at `MAX_PAGE_CHARS`; `undefined` when
 * there is no location (tests, odd embeds).
 */
export function currentPage(
	location:
		| Pick<Location, "pathname" | "search">
		| undefined = globalThis.location,
): string | undefined {
	if (!location) return undefined;
	const page = `${location.pathname}${location.search}`;
	return page ? page.slice(0, MAX_PAGE_CHARS) : undefined;
}
