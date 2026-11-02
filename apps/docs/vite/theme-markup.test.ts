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
