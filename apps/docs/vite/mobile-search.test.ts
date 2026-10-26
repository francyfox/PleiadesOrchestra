import { expect, test } from "bun:test";
import { addMobileSearch } from "./mobile-search.ts";

test("the installed theme's burger menu still has the anchors and gets the search", async () => {
	const path = import.meta
		.resolve("@sveltepress/theme-default/package.json")
		.replace("file://", "")
		.replace("package.json", "dist/components/NavbarMobile.svelte");
	const patched = addMobileSearch(await Bun.file(path).text());
	expect(patched).toContain(
		"import LocalSearch from './search/LocalSearch.svelte'",
	);
	expect(patched).toContain(
		'<Logo />\n    <div class="po-mobile-search"><LocalSearch /></div>',
	);
});

test("a changed theme fails loudly", () => {
	expect(() => addMobileSearch("<nav></nav>")).toThrow("anchor not found");
});
