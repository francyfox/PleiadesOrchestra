import { expect, test } from "bun:test";
import { Glob } from "bun";
import { patchThemeMarkup } from "./theme-markup.ts";

const dist = import.meta
	.resolve("@sveltepress/theme-default/package.json")
	.replace("file://", "")
	.replace("package.json", "dist/");

test("the installed theme's markup has no camelCase SVG attributes or bare pb-4 after the patch", async () => {
	for await (const file of new Glob("**/*.svelte").scan(dist)) {
		const patched = patchThemeMarkup(
			await Bun.file(dist + file).text(),
			`/${file}`,
		);
		expect(patched).not.toMatch(/\s(stroke|fill|clip)[A-Z][A-Za-z]*=/);
		expect(patched).not.toMatch(/^\s+pb-4$/m);
	}
});

test("GlobalLayout gets the skip link before the header and a focusable #main", async () => {
	const patched = patchThemeMarkup(
		await Bun.file(`${dist}components/GlobalLayout.svelte`).text(),
		"/components/GlobalLayout.svelte",
	);
	expect(patched.indexOf("<SkipLink />")).toBeLessThan(
		patched.indexOf("<Navbar />"),
	);
	expect(patched).toContain('<main\n    id="main"\n    tabindex="-1"');
});

test("the sidebar buttons get localized names, the header buttons keep their visible text in the name", async () => {
	const patch = async (file: string) =>
		patchThemeMarkup(await Bun.file(dist + file).text(), `/${file}`);
	expect(await patch("components/MobileSubNav.svelte")).toContain(
		"aria-label={landingContent(localeFromPath(page.url.pathname)).common.openSidebar}",
	);
	expect(await patch("components/Sidebar.svelte")).toContain(
		".common.closeSidebar}",
	);
	expect(await patch("components/search/LocalSearch.svelte")).not.toMatch(
		/local-search-trigger[^>]*aria-label/,
	);
	expect(await patch("components/LocaleSelector.svelte")).toContain(
		'aria-label="{selectorLabel}: {label}"',
	);
});

test("the dark-mode toggle answers Enter/Space and switches without a view transition too", async () => {
	const patched = patchThemeMarkup(
		await Bun.file(`${dist}components/ToggleDark.svelte`).text(),
		"/components/ToggleDark.svelte",
	);
	expect(patched).toContain("e.currentTarget.click()");
	expect(patched).not.toMatch(/[^$]darkMode === '/);
});

test("live code blocks use the light highlighter theme on the light theme", async () => {
	const patched = patchThemeMarkup(
		await Bun.file(`${dist}components/CodeBlock.svelte`).text(),
		"/components/CodeBlock.svelte",
	);
	expect(patched).toContain("light: themeOptions.highlighter.themeLight");
});

test("camelCase SVG attributes become kebab-case", () => {
	expect(
		patchThemeMarkup(
			'<g strokeLinecap="round" strokeDashoffset="1" fillRule="a" clipRule="b">',
			"/icons/X.svelte",
		),
	).toBe(
		'<g stroke-linecap="round" stroke-dashoffset="1" fill-rule="a" clip-rule="b">',
	);
});

test("a changed PageLayout fails loudly", () => {
	expect(() => patchThemeMarkup("<div></div>", "/PageLayout.svelte")).toThrow(
		"anchor not found",
	);
});
