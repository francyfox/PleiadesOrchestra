import type { Plugin } from "vite";

const ANCHORS = [
	[
		"  import NavItem from './NavItem.svelte'\n",
		"  import LocalSearch from './search/LocalSearch.svelte'\n",
	],
	[
		"    <Logo />\n",
		'    <div class="po-mobile-search"><LocalSearch /></div>\n',
	],
] as const;

/**
 * The theme's burger menu (`NavbarMobile.svelte`) with the search in it; below 950px the
 * header's own search is hidden (site-header.css). The theme has no slot for it, so the
 * source is patched the way the theme patches itself (`strip-versioning.js`).
 */
export function addMobileSearch(source: string): string {
	let result = source;
	for (const [anchor, added] of ANCHORS) {
		// A theme update moved the anchor: fail the build instead of silently dropping the search.
		if (!result.includes(anchor))
			throw new Error(
				`[docs] mobile search: NavbarMobile.svelte changed, anchor not found: ${anchor.trim()}`,
			);
		result = result.replace(anchor, anchor + added);
	}
	return result;
}

export function mobileSearch(): Plugin {
	return {
		name: "po-mobile-search",
		enforce: "pre",
		transform(code, id) {
			if (id.includes("?")) return null;
			return id
				.replaceAll("\\", "/")
				.endsWith("/theme-default/dist/components/NavbarMobile.svelte")
				? addMobileSearch(code)
				: null;
		},
	};
}
