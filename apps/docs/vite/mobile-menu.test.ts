import { expect, test } from "bun:test";
import { patchMobileMenu } from "./mobile-menu.ts";

test("the installed theme's burger menu still has the anchors and gets the search, landing links and Escape", async () => {
	const path = import.meta
		.resolve("@sveltepress/theme-default/package.json")
		.replace("file://", "")
		.replace("package.json", "dist/components/NavbarMobile.svelte");
	const patched = patchMobileMenu(await Bun.file(path).text());
	expect(patched).toContain(
		"import LocalSearch from './search/LocalSearch.svelte'",
	);
	expect(patched).toMatch(
		/import LandingNav from '\/.+\/landing\/LandingNav\.svelte'/,
	);
	expect(patched).toContain(
		'<Logo />\n    <div class="po-mobile-search"><LocalSearch /></div>',
	);
	expect(patched).toContain(
		'<svelte:window onkeydown={closeOnEscape} />\n\n<button\n  type="button"\n  class="nav-trigger"\n  bind:this={trigger}\n',
	);
	expect(patched).toContain(
		"    {/each}\n    <LandingNav mobile onnavigate={() => ($navCollapsed = true)} />\n  </nav>\n{/if}",
	);
});

test("a changed theme fails loudly", () => {
	expect(() => patchMobileMenu("<nav></nav>")).toThrow("anchor not found");
});
