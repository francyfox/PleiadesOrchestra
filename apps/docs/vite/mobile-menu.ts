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
	// Escape closes the open menu and hands focus back to the burger.
	[
		"  function toggleNav() {\n",
		"  let trigger = $state()\n  function closeOnEscape(e) {\n    if (e.key !== 'Escape' || $navCollapsed) return\n    $navCollapsed = true\n    trigger?.focus()\n  }\n\n",
		"before",
	],
	[
		'<button\n  type="button"\n  class="nav-trigger"\n',
		"  bind:this={trigger}\n",
	],
	["\n<button\n", "\n<svelte:window onkeydown={closeOnEscape} />\n", "before"],
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
 * its section links at the bottom (LandingNav); below 950px the header's own search is hidden, below
 * 1024px (`lg`) the landing row is; Escape closes the menu. The theme has no slot for them, so the source is patched the way the
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
