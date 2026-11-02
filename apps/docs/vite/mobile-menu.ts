import type { Plugin } from "vite";

// Absolute: the patched file sits in the theme package, where `#lib` does not resolve.
const LANDING_NAV = new URL(
	"../src/lib/components/landing/LandingNav.svelte",
	import.meta.url,
).pathname;

const ANCHORS = [
	[
		"  import NavItem from './NavItem.svelte'\n",
		`  import LocalSearch from './search/LocalSearch.svelte'\n  import LandingNav from '${LANDING_NAV}'\n`,
	],
	[
		"    <Logo />\n",
		'    <div class="po-mobile-search"><LocalSearch /></div>\n',
	],
	[
		"  </nav>\n{/if}",
		"    <LandingNav mobile onnavigate={() => ($navCollapsed = true)} />\n",
		"before",
	],
] as const;

/**
 * The theme's burger menu (`NavbarMobile.svelte`) with the search on top and, on the landing,
 * its section links at the bottom (LandingNav); below 950px the header's own search and the
 * landing row are hidden. The theme has no slot for them, so the source is patched the way the
 * theme patches itself (`strip-versioning.js`).
 */
export function patchMobileMenu(source: string): string {
	let result = source;
	for (const [anchor, added, where] of ANCHORS) {
		// A theme update moved the anchor: fail the build instead of silently dropping the addition.
		if (!result.includes(anchor))
			throw new Error(
				`[docs] mobile menu: NavbarMobile.svelte changed, anchor not found: ${anchor.trim()}`,
			);
		result = result.replace(
			anchor,
			where === "before" ? added + anchor : anchor + added,
		);
	}
	return result;
}

export function mobileMenu(): Plugin {
	return {
		name: "po-mobile-menu",
		enforce: "pre",
		transform(code, id) {
			// Dev asks for `NavbarMobile.svelte?v=<hash>`: skip only Svelte's sub-requests (`?svelte&type=style`).
			const [path, query = ""] = id.split("?");
			if (query.includes("svelte")) return null;
			return path
				.replaceAll("\\", "/")
				.endsWith("/theme-default/dist/components/NavbarMobile.svelte")
				? patchMobileMenu(code)
				: null;
		},
	};
}
