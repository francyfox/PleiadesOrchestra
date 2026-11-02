import type { Plugin } from "vite";

// Absolute: the patched file sits in the theme package, where `#lib` does not resolve.
const SKIP_LINK = new URL(
	"../src/lib/components/SkipLink.svelte",
	import.meta.url,
).pathname;
const site = (file: string) => new URL(file, import.meta.url).pathname;
// The site's localized words in a theme component (its `page` import is already there).
const WORDS_IMPORT = `  import { localeFromPath } from '${site("../src/lib/i18n.ts")}'\n  import { landingContent } from '${site("../src/lib/landing/content.ts")}'\n`;
const word = (key: string) =>
	`aria-label={landingContent(localeFromPath(page.url.pathname)).common.${key}}`;

/** Per theme file: [anchor, replacement]. A missing anchor fails the build (a theme update moved it). */
const PATCHES: Record<string, [string, string][]> = {
	// Uno attributify: a bare `pb-4` attribute is invalid HTML; docs-theme.css keeps the padding.
	"/PageLayout.svelte": [
		[
			'    <div\n      pb-4\n      class="theme-default--page-layout"',
			'    <div\n      class="theme-default--page-layout"',
		],
	],
	// Skip link as the first focusable element, aimed at <main> (focusable so focus moves into it).
	"/GlobalLayout.svelte": [
		[
			"  import Navbar from './Navbar.svelte'\n",
			`  import Navbar from './Navbar.svelte'\n  import SkipLink from '${SKIP_LINK}'\n`,
		],
		[
			"\n{#if resolveVersionManifest(page.url.pathname)}\n  <VersionLifecycleBanner />",
			"\n<SkipLink />\n{#if resolveVersionManifest(page.url.pathname)}\n  <VersionLifecycleBanner />",
		],
		["  <main\n", '  <main\n    id="main"\n    tabindex="-1"\n'],
	],
	// The link around the logo is already named by the site title next to it.
	"/components/Logo.svelte": [["alt={siteConfig.title}", 'alt=""']],
	// External header links (panel, GitHub) open in the same tab, like the same links in the hero and footer:
	// the theme names them by aria-label, so a "new tab" hint could not be added.
	"/components/NavItem.svelte": [
		["    {...external ? { target: '_blank' } : {}}\n", ""],
	],
	// Icon-only buttons that open/close the docs sidebar on phones have no name.
	"/components/MobileSubNav.svelte": [
		[
			"  import MenuOpen from './icons/MenuOpen.svelte'\n",
			`  import MenuOpen from './icons/MenuOpen.svelte'\n${WORDS_IMPORT}`,
		],
		[
			'        class="text-6"\n',
			`        class="text-6"\n        ${word("openSidebar")}\n`,
		],
	],
	"/components/Sidebar.svelte": [
		[
			"  import Close from './icons/Close.svelte'\n",
			`  import Close from './icons/Close.svelte'\n${WORDS_IMPORT}`,
		],
		[
			'      class="close"\n',
			`      class="close"\n      ${word("closeSidebar")}\n`,
		],
	],
	// The visible text must be part of the accessible name (WCAG 2.5.3): the search button is
	// named by its own text, the language button says the select's purpose and the shown language.
	"/components/search/LocalSearch.svelte": [
		[
			'  class="local-search-trigger {className}"\n  aria-label={placeholder}\n',
			'  class="local-search-trigger {className}"\n',
		],
	],
	// Code-group tabs (`role="tab"`) need a tablist parent, and the selected one says so.
	"/components/Tabs.svelte": [
		[
			'  <div class="tab-header" style="--bar-op:0;">\n',
			'  <div class="tab-header" role="tablist" style="--bar-op:0;">\n',
		],
		[
			'        role="tab"\n        tabindex="0"\n',
			'        role="tab"\n        aria-selected={active}\n        tabindex="0"\n',
		],
	],
	// The dark-mode toggle (`role="button"` div) ignores Enter/Space; a synthetic click runs the theme's own toggle.
	// Its no-transition branch (reduced motion) compares the store itself, not its value, so it never switched.
	"/components/ToggleDark.svelte": [
		[
			"  onkeyup={() => {}}\n",
			"  onkeydown={(e) => {\n    if (e.key === 'Enter' || e.key === ' ') {\n      e.preventDefault()\n      e.currentTarget.click()\n    }\n  }}\n",
		],
		["      if (darkMode === 'light') {", "      if ($darkMode === 'light') {"],
		["} else if (darkMode === 'dark') {", "} else if ($darkMode === 'dark') {"],
		["} else if (darkMode === 'auto') {", "} else if ($darkMode === 'auto') {"],
	],
	"/components/LocaleSelector.svelte": [
		[
			'      class="locale-trigger"\n      aria-label={selectorLabel}\n',
			'      class="locale-trigger"\n      aria-label="{selectorLabel}: {label}"\n',
		],
	],
};

/**
 * Valid HTML from the theme's markup (W3C validator): its icons use React-style SVG attributes
 * (`strokeLinecap`), which Svelte writes verbatim, so they become kebab-case (`stroke-linecap`).
 * Plus the per-file PATCHES above.
 */
export function patchThemeMarkup(source: string, file: string): string {
	let result = source.replace(
		/(\s)(stroke|fill|clip)([A-Z][A-Za-z]*)=/g,
		(_, space, head, tail: string) =>
			`${space}${head}${tail.replace(/[A-Z]/g, (c) => `-${c.toLowerCase()}`)}=`,
	);
	for (const [suffix, patches] of Object.entries(PATCHES)) {
		if (!file.endsWith(suffix)) continue;
		for (const [anchor, replacement] of patches) {
			if (!result.includes(anchor))
				throw new Error(
					`[docs] theme markup: ${suffix} changed, anchor not found: ${anchor.trim()}`,
				);
			result = result.replace(anchor, replacement);
		}
	}
	return result;
}

export function themeMarkup(): Plugin {
	return {
		name: "po-theme-markup",
		enforce: "pre",
		transform(code, id) {
			// Dev asks for `File.svelte?v=<hash>`: skip only Svelte's sub-requests (`?svelte&type=style`).
			const [raw, query = ""] = id.split("?");
			if (query.includes("svelte")) return null;
			const file = raw.replaceAll("\\", "/");
			return file.includes("/theme-default/dist/") && file.endsWith(".svelte")
				? patchThemeMarkup(code, file)
				: null;
		},
	};
}
