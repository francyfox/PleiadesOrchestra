import type { Plugin } from "vite";

// Uno attributify: a bare `pb-4` attribute is invalid HTML; docs-theme.css keeps the padding.
const PAGE_LAYOUT_ANCHOR =
	'    <div\n      pb-4\n      class="theme-default--page-layout"';

/**
 * Valid HTML from the theme's markup (W3C validator): its icons use React-style SVG attributes
 * (`strokeLinecap`), which Svelte writes verbatim, so they become kebab-case (`stroke-linecap`).
 */
export function patchThemeMarkup(source: string, file: string): string {
	let result = source.replace(
		/(\s)(stroke|fill|clip)([A-Z][A-Za-z]*)=/g,
		(_, space, head, tail: string) =>
			`${space}${head}${tail.replace(/[A-Z]/g, (c) => `-${c.toLowerCase()}`)}=`,
	);
	if (file.endsWith("/PageLayout.svelte")) {
		// A theme update moved the anchor: fail the build instead of shipping the bare attribute.
		if (!result.includes(PAGE_LAYOUT_ANCHOR))
			throw new Error(
				"[docs] theme markup: PageLayout.svelte changed, `pb-4` anchor not found",
			);
		result = result.replace(
			PAGE_LAYOUT_ANCHOR,
			PAGE_LAYOUT_ANCHOR.replace("\n      pb-4", ""),
		);
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
