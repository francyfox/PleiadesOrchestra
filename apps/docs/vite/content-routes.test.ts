import { describe, expect, test } from "bun:test";
import { join } from "node:path";
import { ALL_LOCALES, DEFAULT_LOCALE, LOCALES } from "../src/lib/i18n.ts";
import {
	buildLlmsFull,
	buildLlmsTxt,
	buildPage,
	cleanMarkdown,
	contentRouteFile,
	folderRedirects,
	headingSlugs,
	isEnglishOnly,
	listMarkdown,
	llmsFiles,
	loadContent,
	type PageSet,
	pageDescription,
	pageMarkdownPath,
	parseFrontmatter,
	rewriteLinks,
	sidebarItems,
	withEnglishFallback,
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

	test("review: pending puts the notice at the top, other pages get none", () => {
		const pending = "---\ntitle: T\nreview: pending\n---\n\n# T\n";
		expect(parseFrontmatter(pending).review).toBe("pending");
		expect(buildPage("kk", "a.md", set(pending))).toContain(
			'<ReviewNotice locale="kk" />',
		);
		const ok = "---\ntitle: T\n---\n\n# T\n";
		expect(buildPage("en", "a.md", set(ok))).not.toContain("ReviewNotice");
	});

	test("a page without a description gets its first paragraph (theme meta + OpenGraph)", () => {
		expect(
			pageDescription(
				"---\ntitle: T\n---\n\n# T\n\nThe **site** uses [tools](/docs/tools/) and `code`.\nSecond line.\n\n## Next\n",
			),
		).toBe("The site uses tools and code. Second line.");
		expect(
			pageDescription(`# T\n\n${"word ".repeat(80)}`).length,
		).toBeLessThanOrEqual(200);
		const out = buildPage(
			"en",
			"a.md",
			set("---\ntitle: T\n---\n\n# T\n\nHello there.\n"),
		);
		expect(out).toStartWith('---\ntitle: T\ndescription: "Hello there."\n---');
		expect(out).toContain(
			`const seo = {"title":"T - PleiadesOrchestra","description":"Hello there.","locale":"en"}`,
		);
	});

	test("the page's own H1 is dropped: the theme prints the frontmatter title", () => {
		const out = buildPage(
			"en",
			"a.md",
			set("---\ntitle: T\n---\n\n# T\n\nText\n\n## Sub\n"),
		);
		expect(out).not.toContain("# T\n");
		expect(out).toContain("## Sub");
		expect(out).toContain("<CopyPage");
		expect(out).toContain(`markdown="/docs/a/index.html.md" llms="/llms.txt"`);
	});
});

describe("translations mirror English", () => {
	const en = new Map(
		[...(content.get(DEFAULT_LOCALE) ?? [])].filter(
			([rel]) => !isEnglishOnly(rel),
		),
	);

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

describe("sidebar", () => {
	const pages: PageSet = new Map([
		["index.md", "---\ntitle: Обзор\n---\n"],
		["widget/index.md", "---\ntitle: Виджет\n---\n"],
		["api/server.md", "---\ntitle: Серверный API\n---\n"],
	]);

	test("Intro (and a folder's overview) come first: the theme highlights every link under the current route, so no page sits at a bare folder URL", () => {
		const items = sidebarItems(
			new Map([
				["api/server.md", "---\ntitle: API\n---\n"],
				["intro.md", "---\ntitle: Intro\n---\n"],
				["api/overview.md", "---\ntitle: Overview\n---\n"],
			]),
		);
		expect(items.map((i) => i.title)).toEqual(["Intro", "Overview", "API"]);
	});

	test("/docs/ and /ru/docs/ redirect to their first page", () => {
		expect(folderRedirects(content)).toEqual(
			expect.arrayContaining([
				{ route: "docs", to: "/docs/intro/" },
				{ route: "ru/docs", to: "/ru/docs/intro/" },
			]),
		);
	});

	test("one item per page, titled in the page's language, linked by logical path", () => {
		expect(sidebarItems(pages)).toEqual([
			{ title: "Обзор", to: "/docs/" },
			{ title: "Серверный API", to: "/docs/api/server/" },
			{ title: "Виджет", to: "/docs/widget/" },
		]);
	});
});

describe("llms.txt (llmstxt.org)", () => {
	const site = { title: "Site", description: "What it is." };
	const pages = (
		en: Record<string, string>,
		kk: Record<string, string> = {},
	): Map<string, PageSet> =>
		new Map([
			["en", new Map(Object.entries(en))],
			["kk", new Map(Object.entries(kk))],
		]);
	const page = (title: string, body = "") =>
		`---\ntitle: ${title}\n---\n\n# ${title}\n${body}`;

	test("a page's Markdown sits next to it as index.html.md", () => {
		expect(pageMarkdownPath("index.md", "en")).toBe("docs/index.html.md");
		expect(pageMarkdownPath("api/server.md", "kk")).toBe(
			"kk/docs/api/server/index.html.md",
		);
	});

	test("clean Markdown: no frontmatter, the Svelte-only code escape back to backticks", () => {
		const md =
			"---\ntitle: T\n---\n\n# T\n\nUse <code>{'${VAR}'}</code> here.\n";
		expect(cleanMarkdown(md)).toBe("# T\n\nUse `${VAR}` here.\n");
	});

	test("H1, summary, the docs list and other languages under Optional", () => {
		const txt = buildLlmsTxt(
			"en",
			pages({ "index.md": page("Home") }, { "index.md": page("Басты") }),
			site,
		);
		expect(txt).toStartWith("# Site\n\n> What it is.\n");
		expect(txt).toContain("## Docs\n\n- [Home](/docs/index.html.md)\n");
		const optional = txt.slice(txt.indexOf("## Optional"));
		expect(optional).toContain("(/kk/llms.txt)");
		expect(txt.indexOf("## Docs")).toBeLessThan(txt.indexOf("## Optional"));
	});

	test("a translation lists its own pages under its prefix", () => {
		const txt = buildLlmsTxt(
			"kk",
			pages({ "index.md": page("Home") }, { "index.md": page("Басты") }),
			site,
		);
		expect(txt).toContain("- [Басты](/kk/docs/index.html.md)");
		expect(txt).toContain("(/llms.txt)");
	});

	test("llms-full.txt: every English page, in order", () => {
		const full = buildLlmsFull(
			pages({
				"index.md": page("Home", "\nhello\n"),
				"api/server.md": page("Server"),
			}),
			site,
		);
		expect(full).toContain("hello");
		expect(full.indexOf("# Home")).toBeLessThan(full.indexOf("# Server"));
	});

	test("every real page gets a Markdown file, every locale an llms.txt", () => {
		const files = llmsFiles(content, site);
		for (const locale of ALL_LOCALES) {
			expect(
				files.has(
					locale === DEFAULT_LOCALE ? "llms.txt" : `${locale}/llms.txt`,
				),
			).toBe(true);
		}
		expect(files.has("llms-full.txt")).toBe(true);
		expect(files.has("docs/intro/index.html.md")).toBe(true);
	});
});

describe("withEnglishFallback", () => {
	test("a language without a translation gets the English page; its own page wins", () => {
		const out = withEnglishFallback(
			new Map([
				[
					"en",
					new Map([
						["a.md", "EN a"],
						["b.md", "EN b"],
					]),
				],
				["ru", new Map([["a.md", "RU a"]])],
			]),
		);
		expect(out.get("ru")?.get("a.md")).toBe("RU a");
		expect(out.get("ru")?.get("b.md")).toBe("EN b");
		expect(out.get("en")?.has("a.md")).toBe(true);
	});
});
