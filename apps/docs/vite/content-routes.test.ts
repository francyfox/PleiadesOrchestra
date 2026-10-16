import { describe, expect, test } from "bun:test";
import { join } from "node:path";
import { ALL_LOCALES, DEFAULT_LOCALE, LOCALES } from "../src/lib/i18n.ts";
import {
	buildPage,
	contentRouteFile,
	headingSlugs,
	listMarkdown,
	loadContent,
	type PageSet,
	parseFrontmatter,
	rewriteLinks,
} from "./content-routes.ts";

const root = join(import.meta.dirname, "..");
const content = loadContent(join(root, "content"));

describe("route layout", () => {
	test("content/en/index.md is the docs root", () => {
		expect(contentRouteFile("index.md", "en")).toBe("docs/+page.md");
	});

	test("a nested page becomes a folder with +page.md", () => {
		expect(contentRouteFile("guide/setup.md", "en")).toBe(
			"docs/guide/setup/+page.md",
		);
	});

	test("a folder index.md is the folder page", () => {
		expect(contentRouteFile("guide/index.md", "en")).toBe(
			"docs/guide/+page.md",
		);
	});

	test("other locales live under a locale prefix", () => {
		expect(contentRouteFile("index.md", "kk")).toBe("kk/docs/+page.md");
		expect(contentRouteFile("api/server.md", "ru")).toBe(
			"ru/docs/api/server/+page.md",
		);
	});
});

describe("headingSlugs", () => {
	test("replaces & # $ ? * : / and spaces with -, keeps case", () => {
		expect(headingSlugs("## Tools in: other/windows")).toEqual([
			{ depth: 2, slug: "Tools-in--other-windows" },
		]);
	});

	test("inline code counts, emphasis and links do not, fences are skipped", () => {
		const md = [
			"# The `<pleiades-chat>` widget",
			"```sh",
			"# not a heading",
			"```",
			"### `POST /v1/widget/tools`",
			"## A **bold** [link](/x) word",
		].join("\n");
		expect(headingSlugs(md).map((h) => h.slug)).toEqual([
			"The-<pleiades-chat>-widget",
			"POST--v1-widget-tools",
			"A---word",
		]);
	});

	test("duplicates get a trailing underscore like the theme does", () => {
		expect(headingSlugs("## A\n## A\n").map((h) => h.slug)).toEqual([
			"A",
			"A_",
		]);
	});
});

describe("rewriteLinks", () => {
	const en: PageSet = new Map([
		["a.md", "# A\n\n## First\n\n## Second\n"],
		["b/index.md", "# B\n\n## Intro\n"],
	]);
	const ru: PageSet = new Map([
		["a.md", "# А\n\n## Первый\n\n## Второй\n"],
		["b/index.md", "# Б\n\n## Вступление\n"],
	]);
	const ctx = { locale: "ru", self: "a.md", en, own: ru };

	test("prefixes docs links and maps the anchor by heading position", () => {
		expect(
			rewriteLinks("See [a](/docs/a/#Second) and [b](/docs/b/).", ctx),
		).toBe("See [a](/ru/docs/a/#Второй) and [b](/ru/docs/b/).");
	});

	test("maps same-page anchors and leaves code fences alone", () => {
		expect(rewriteLinks("[x](#First)\n```\n[y](/docs/a/)\n```", ctx)).toBe(
			"[x](#Первый)\n```\n[y](/docs/a/)\n```",
		);
	});

	test("an unknown page or anchor throws", () => {
		expect(() => rewriteLinks("[x](/docs/nope/)", ctx)).toThrow();
		expect(() => rewriteLinks("[x](#Nope)", ctx)).toThrow();
	});
});

describe("buildPage", () => {
	const set = (md: string): Map<string, PageSet> =>
		new Map([
			[
				"en",
				new Map([
					["a.md", md],
					["b/index.md", md],
				]),
			],
			[
				"kk",
				new Map([
					["a.md", md],
					["b/index.md", md],
				]),
			],
		]);

	test("review: pending turns the notice on, otherwise it is off", () => {
		const pending = "---\ntitle: T\nreview: pending\n---\n\n# T\n";
		expect(parseFrontmatter(pending).review).toBe("pending");
		expect(buildPage("kk", "a.md", set(pending))).toContain("pending={true}");
		const ok = "---\ntitle: T\n---\n\n# T\n";
		expect(buildPage("en", "a.md", set(ok))).toContain("pending={false}");
	});

	test("the language switch component gets the docs path", () => {
		const md = "---\ntitle: T\n---\n\n# T\n";
		const out = buildPage("kk", "b/index.md", set(md));
		expect(out).toContain('path="/b/"');
		expect(out).toContain('locale="kk"');
	});
});

describe("translations mirror English", () => {
	const en = content.get(DEFAULT_LOCALE) ?? new Map<string, string>();

	test("all locales are present", () => {
		expect([...content.keys()].sort()).toEqual([...ALL_LOCALES].sort());
	});

	for (const locale of LOCALES) {
		const tr = content.get(locale) ?? new Map<string, string>();

		test(`${locale}: same set of pages as en`, () => {
			expect([...tr.keys()].sort()).toEqual([...en.keys()].sort());
		});

		for (const [rel, enMd] of en) {
			test(`${locale}/${rel}: same headings per level`, () => {
				expect(headingSlugs(tr.get(rel) ?? "").map((h) => h.depth)).toEqual(
					headingSlugs(enMd).map((h) => h.depth),
				);
			});

			test(`${locale}/${rel}: rewritten links and anchors exist in their target`, () => {
				const out = buildPage(locale, rel, content);
				const slugs = (r: string) =>
					headingSlugs(tr.get(r) ?? "").map((h) => decodeURI(h.slug));
				for (const m of out.matchAll(/\]\(#([^)\s]+)\)/g)) {
					expect(slugs(rel)).toContain(decodeURI(m[1] ?? ""));
				}
				const re = new RegExp(
					`\\]\\(/${locale}/docs/([^)#\\s]*)(?:#([^)\\s]+))?\\)`,
					"g",
				);
				for (const m of out.matchAll(re)) {
					const dir = m[1] ?? "";
					const target = [
						`${dir}index.md`,
						`${dir.replace(/\/$/, "")}.md`,
					].find((c) => tr.has(c));
					expect(target).toBeDefined();
					if (m[2] && target) expect(slugs(target)).toContain(decodeURI(m[2]));
				}
			});
		}
	}

	test("listMarkdown finds nested pages", () => {
		expect(listMarkdown(join(root, "content", "en"))).toContain(
			"api/server.md",
		);
	});
});
