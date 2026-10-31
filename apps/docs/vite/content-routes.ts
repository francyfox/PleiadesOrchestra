import {
	existsSync,
	mkdirSync,
	readdirSync,
	readFileSync,
	rmSync,
	statSync,
	writeFileSync,
} from "node:fs";
import { dirname, join, relative } from "node:path";
import type { Plugin } from "vite";
import { ALL_LOCALES, DEFAULT_LOCALE } from "../src/lib/i18n.ts";
import { SITE } from "../src/lib/site.ts";

/** One locale's pages: path relative to `content/<locale>/` (`/`-separated) -> Markdown. */
export type PageSet = Map<string, string>;

/** English-only benchmark results (`content/en/benchmarks/`): numbers and setups, not translated either. */
export const BENCHMARKS_DIR = "benchmarks/";

/** A page that exists only in English: translations don't mirror it. */
export const isEnglishOnly = (rel: string) => rel.startsWith(BENCHMARKS_DIR);

/**
 * SveltePress renders pages only from `src/routes/**\/+page.md`. The docs pages are
 * written as plain `content/<locale>/**\/*.md`; this maps one of them (path relative to
 * `content/<locale>/`) to its route file relative to the routes dir. English is unprefixed,
 * every other locale gets a `<locale>/` prefix (`/ru/docs/...`).
 *
 *   en: index.md       -> docs/+page.md
 *   en: guide/setup.md -> docs/guide/setup/+page.md
 *   kk: guide/index.md -> kk/docs/guide/+page.md
 */
export function contentRouteFile(rel: string, locale: string): string {
	const withoutExt = rel.replace(/\.md$/, "");
	const dir =
		withoutExt === "index" ? "" : withoutExt.replace(/(^|\/)index$/, "");
	const prefix = locale === DEFAULT_LOCALE ? "" : locale;
	return [prefix, "docs", dir, "+page.md"].filter(Boolean).join("/");
}

/**
 * A language's sidebar: its own page titles, linked by the logical path the
 * theme prefixes with the locale. The theme's auto sidebar is built for the
 * site-level options only and keeps English titles on translated pages.
 */
export function sidebarItems(pages: PageSet): { title: string; to: string }[] {
	return [...pages.keys()].sort(byPageOrder).map((rel) => ({
		title: parseFrontmatter(pages.get(rel) ?? "").title ?? rel,
		to: `/${contentRouteFile(rel, DEFAULT_LOCALE).replace(/\+page\.md$/, "")}`,
	}));
}

/**
 * A folder's first page (`intro.md`, `overview.md`). The theme marks every sidebar link
 * under the current route active (`isLinkActive`), so a page at a bare folder URL
 * (`/docs/`) lit up the whole menu: the folder gets this page instead and redirects to it.
 */
const FOLDER_FIRST = /(^|\/)(intro|overview)\.md$/;

/** URL order, a folder's first page ahead of the rest of that folder. */
function byPageOrder(a: string, b: string): number {
	const key = (rel: string) => {
		const to = `/${contentRouteFile(rel, DEFAULT_LOCALE)}`;
		return FOLDER_FIRST.test(rel) ? to.replace(/[^/]+\/\+page\.md$/, "\0") : to;
	};
	return key(a).localeCompare(key(b));
}

/** Folder URLs without a page of their own that redirect to the folder's first page. */
export function folderRedirects(
	content: Map<string, PageSet>,
): { route: string; to: string }[] {
	return [...content].flatMap(([locale, pages]) =>
		[...pages.keys()]
			.filter((rel) => FOLDER_FIRST.test(rel))
			.filter((rel) => !pages.has(rel.replace(FOLDER_FIRST, "$1index.md")))
			.map((rel) => {
				const page = contentRouteFile(rel, locale).replace(/\+page\.md$/, "");
				return {
					route: page.replace(/[^/]+\/$/, "").replace(/\/$/, ""),
					to: `/${page}`,
				};
			}),
	);
}

export function listMarkdown(dir: string, base = dir): string[] {
	if (!existsSync(dir)) return [];
	return readdirSync(dir).flatMap((name) => {
		const full = join(dir, name);
		if (statSync(full).isDirectory()) return listMarkdown(full, base);
		return name.endsWith(".md")
			? [relative(base, full).split("\\").join("/")]
			: [];
	});
}

/** Reads `content/<locale>/**` for every locale folder. */
export function loadContent(contentDir: string): Map<string, PageSet> {
	const all = new Map<string, PageSet>();
	if (!existsSync(contentDir)) return all;
	for (const locale of readdirSync(contentDir)) {
		const dir = join(contentDir, locale);
		if (!statSync(dir).isDirectory()) continue;
		all.set(
			locale,
			new Map(
				listMarkdown(dir).map((rel) => [
					rel,
					readFileSync(join(dir, rel), "utf8"),
				]),
			),
		);
	}
	return all;
}

/**
 * Every language shows every English page: a page without a translation is served in English
 * (route, sidebar, llms.txt). A translated page overrides its English one.
 */
export function withEnglishFallback(
	content: Map<string, PageSet>,
): Map<string, PageSet> {
	const en = content.get(DEFAULT_LOCALE) ?? new Map<string, string>();
	return new Map(
		[...content].map(([locale, pages]) => [
			locale,
			locale === DEFAULT_LOCALE ? pages : new Map([...en, ...pages]),
		]),
	);
}

/** Top-level `key: value` pairs of the YAML frontmatter (all this site uses). */
export function parseFrontmatter(md: string): Record<string, string> {
	const block = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?/.exec(md)?.[1] ?? "";
	return Object.fromEntries(
		block
			.split(/\r?\n/)
			.map((line) => /^([\w-]+):\s*(.*)$/.exec(line))
			.flatMap((m) => (m?.[1] ? [[m[1], (m[2] ?? "").trim()]] : [])),
	);
}

/** Lines of `md` with a flag for being inside a fenced code block. */
function* markdownLines(
	md: string,
): Generator<{ line: string; code: boolean }> {
	let fence: string | undefined;
	for (const line of md.split("\n")) {
		const m = /^\s*(`{3,}|~{3,})/.exec(line);
		if (fence) {
			yield { line, code: true };
			if (m?.[1]?.startsWith(fence) && line.trim() === m[1]) fence = undefined;
		} else if (m?.[1]) {
			fence = m[1];
			yield { line, code: true };
		} else {
			yield { line, code: false };
		}
	}
}

/**
 * Heading ids exactly as `@sveltepress/theme-default` (`dist/markdown/anchors.js`) builds them:
 * only the plain text and inline code of a heading count (emphasis and links are dropped),
 * `[&#$?* :/]` become `-`, case is kept, and a repeated id gets `_` appended.
 */
export function headingSlugs(md: string): { depth: number; slug: string }[] {
	const seen = new Set<string>();
	const out: { depth: number; slug: string }[] = [];
	for (const { line, code } of markdownLines(md)) {
		const m = /^(#{1,6})\s+(.*?)(?:\s+#+)?\s*$/.exec(line);
		if (code || !m?.[1]) continue;
		const title = (m[2] ?? "").replace(
			/(`+)([^`]+?)\1|!?\[[^\]]*\]\([^)]*\)|\*\*[^*]+\*\*|\*[^*]+\*/g,
			(_all, _ticks, codeText?: string) => codeText ?? "",
		);
		let slug = title.replace(/[&#$?* :/]/g, "-");
		while (seen.has(slug)) slug += "_";
		seen.add(slug);
		out.push({ depth: m[1].length, slug });
	}
	return out;
}

/** Parentheses would end a Markdown link destination early. */
const escapeAnchor = (slug: string) =>
	slug.replace(/\(/g, "%28").replace(/\)/g, "%29");

export interface RewriteContext {
	locale: string;
	/** The page being rewritten (key in `own`). */
	self: string;
	en: PageSet;
	own: PageSet;
}

/**
 * For a translated page: `/docs/x/` -> `/<locale>/docs/x/`, and every anchor (also `#Id` on the
 * same page) -> the id of the heading at the same position in the translated target page.
 * Translations keep the heading order and count of English, so position is the key.
 */
export function rewriteLinks(md: string, ctx: RewriteContext): string {
	const mapAnchor = (targetRel: string, anchor: string): string => {
		const enSlugs = headingSlugs(ctx.en.get(targetRel) ?? "").map(
			(h) => h.slug,
		);
		const at = enSlugs.indexOf(anchor);
		const own = headingSlugs(ctx.own.get(targetRel) ?? "")[at]?.slug;
		if (at < 0 || own === undefined) {
			throw new Error(
				`[docs] ${ctx.locale}/${ctx.self}: anchor #${anchor} has no heading in ${targetRel}`,
			);
		}
		return escapeAnchor(own);
	};
	const pageOf = (url: string): string => {
		const dir = url.replace(/^\/docs\/?/, "").replace(/\/$/, "");
		const rel = [dir ? `${dir}.md` : "index.md", `${dir}/index.md`].find((c) =>
			ctx.en.has(c),
		);
		if (!rel) {
			throw new Error(`[docs] ${ctx.locale}/${ctx.self}: no page for ${url}`);
		}
		return rel;
	};
	return [...markdownLines(md)]
		.map(({ line, code }) =>
			code
				? line
				: line.replace(
						/\]\((\/docs(?:\/[^)#\s]*)?)?(?:#([^)\s]*))?\)/g,
						(all, url?: string, anchor?: string) => {
							if (url === undefined && anchor === undefined) return all;
							const target = url === undefined ? ctx.self : pageOf(url);
							const href = url === undefined ? "" : `/${ctx.locale}${url}`;
							const hash = anchor ? `#${mapAnchor(target, anchor)}` : "";
							return `](${href}${hash})`;
						},
					),
		)
		.join("\n");
}

/**
 * The Markdown written to `src/routes`: links rewritten for translations, plus a small header
 * (language switch and, while `review: pending`, a "machine translation" notice) after the frontmatter.
 */
export function buildPage(
	locale: string,
	rel: string,
	content: Map<string, PageSet>,
): string {
	const body = pageSource(locale, rel, content);
	const pending = parseFrontmatter(body).review === "pending";
	// Every page: its Markdown and llms.txt announced for agents (llmstxt.org) and the
	// copy buttons. A machine translation under review also says so at the top; the
	// language switch itself is the theme's (sveltepress `locales` in vite.config.ts).
	const fm = parseFrontmatter(body);
	const description = fm.description ?? pageDescription(body);
	const card = fm.title ? `${fm.title} - ${SITE.title}` : SITE.title;
	const header = [
		"<script>",
		"\timport CopyPage from '#lib/components/CopyPage.svelte'",
		"\timport Seo from '#lib/components/Seo.svelte'",
		// In the script, not in the markup: the Markdown pass would turn a URL in the text into a link.
		`\tconst seo = ${JSON.stringify({ title: card, description, locale })}`,
		...(pending
			? ["\timport ReviewNotice from '#lib/components/ReviewNotice.svelte'"]
			: []),
		...(body.includes("<WidgetInstall")
			? ["\timport WidgetInstall from '#lib/components/WidgetInstall.svelte'"]
			: []),
		"</script>",
		"",
		"<Seo title={seo.title} description={seo.description} locale={seo.locale} />",
		...(pending ? [`<ReviewNotice locale="${locale}" />`, ""] : []),
		// The head links live in CopyPage: SveltePress prints a `<svelte:head>` in Markdown as text.
		`<CopyPage locale="${locale}" markdown="/${pageMarkdownPath(rel, locale)}" llms="/${llmsTxtPath(locale)}" />`,
		"",
	].join("\n");
	let front = FRONTMATTER.exec(body)?.[0] ?? "";
	// The theme's <meta name="description"> reads the frontmatter; JSON is a valid YAML string.
	if (front && !fm.description && description) {
		front = front.replace(
			/\r?\n---\r?\n?$/,
			`\ndescription: ${JSON.stringify(description)}\n---\n`,
		);
	}
	let rest = body.slice(FRONTMATTER.exec(body)?.[0].length ?? 0);
	// The theme prints `title` from the frontmatter as the page's H1; the page's own `# …` would repeat it.
	if (parseFrontmatter(body).title) rest = rest.replace(/^\s*# .*\r?\n/, "");
	return `${front}\n${header}\n${rest}`;
}

const FRONTMATTER = /^---\r?\n[\s\S]*?\r?\n---\r?\n?/;

const DESCRIPTION_MAX = 200;

/** The page's first paragraph as plain text (≤ 200 chars): its description when the frontmatter has none. */
export function pageDescription(md: string): string {
	const lines: string[] = [];
	for (const { line, code } of markdownLines(md.replace(FRONTMATTER, ""))) {
		const text = line.trim();
		if (code || /^(#|<|>|[-*|]|\d+\.)/.test(text)) {
			if (lines.length) break;
			continue;
		}
		if (!text) {
			if (lines.length) break;
			continue;
		}
		lines.push(text);
	}
	const plain = lines
		.join(" ")
		.replace(/<code>\{'(.*?)'\}<\/code>/g, "$1")
		.replace(/!?\[([^\]]*)\]\([^)]*\)/g, "$1")
		.replace(/(\*\*|__|\*|_|`)(.+?)\1/g, "$2")
		.replace(/\s+/g, " ")
		.trim();
	if (plain.length <= DESCRIPTION_MAX) return plain;
	const cut = plain.slice(0, DESCRIPTION_MAX - 1);
	return `${cut.slice(0, cut.lastIndexOf(" "))}…`;
}

/** A page's Markdown as written, links rewritten for translations. */
function pageSource(
	locale: string,
	rel: string,
	content: Map<string, PageSet>,
): string {
	const md = content.get(locale)?.get(rel) ?? "";
	return locale === DEFAULT_LOCALE
		? md
		: rewriteLinks(md, {
				locale,
				self: rel,
				en: content.get(DEFAULT_LOCALE) ?? new Map(),
				own: content.get(locale) ?? new Map(),
			});
}

/** The page's Markdown next to it (llmstxt.org: a URL without a file name gets `index.html.md`). */
export const pageMarkdownPath = (rel: string, locale: string) =>
	contentRouteFile(rel, locale).replace(/\+page\.md$/, "index.html.md");

const llmsTxtPath = (locale: string) =>
	locale === DEFAULT_LOCALE ? "llms.txt" : `${locale}/llms.txt`;

/** Clean Markdown for agents: no frontmatter, the Svelte-only `<code>{'…'}</code>` escape back to backticks. */
export function cleanMarkdown(md: string): string {
	return `${md
		.replace(FRONTMATTER, "")
		.replace(/<code>\{'(.*?)'\}<\/code>/g, "`$1`")
		.trim()}\n`;
}

export interface SiteInfo {
	title: string;
	description: string;
}

const LANGUAGE_NAMES: Record<string, string> = {
	en: "English",
	ru: "Русский",
	kk: "Қазақша",
};

/**
 * `/llms.txt` (`/<locale>/llms.txt` for a translation), per llmstxt.org: H1, a summary
 * blockquote, then file lists. The docs come first; the other languages go under
 * "Optional", which an agent may skip.
 */
export function buildLlmsTxt(
	locale: string,
	content: Map<string, PageSet>,
	site: SiteInfo,
): string {
	const pages = content.get(locale) ?? new Map<string, string>();
	const item = (rel: string) =>
		`- [${parseFrontmatter(pages.get(rel) ?? "").title ?? rel}](/${pageMarkdownPath(rel, locale)})`;
	const rels = [...pages.keys()].sort(byPageOrder);
	const optional = [
		...(locale === DEFAULT_LOCALE
			? ["- [All English docs in one file](/llms-full.txt)"]
			: []),
		...[...content.keys()]
			.filter((other) => other !== locale)
			.map(
				(other) =>
					`- [${LANGUAGE_NAMES[other] ?? other}](/${llmsTxtPath(other)}): the docs in this language`,
			),
	];
	return [
		`# ${site.title}`,
		"",
		`> ${site.description}`,
		"",
		"Every docs page is also served as clean Markdown at its URL + `index.html.md` (linked below).",
		"",
		"## Docs",
		"",
		...rels.map(item),
		"",
		"## Optional",
		"",
		...optional,
		"",
	].join("\n");
}

/** `/llms-full.txt`: every English docs page in one Markdown file. */
export function buildLlmsFull(
	content: Map<string, PageSet>,
	site: SiteInfo,
): string {
	const pages = content.get(DEFAULT_LOCALE) ?? new Map<string, string>();
	return [
		`# ${site.title}\n\n> ${site.description}\n`,
		...[...pages.keys()]
			.sort(byPageOrder)
			.map((rel) => cleanMarkdown(pages.get(rel) ?? "")),
	].join("\n---\n\n");
}

/** Every agent-facing file, by path under `static/`. */
export function llmsFiles(
	content: Map<string, PageSet>,
	site: SiteInfo,
): Map<string, string> {
	const files = new Map<string, string>([
		["llms-full.txt", buildLlmsFull(content, site)],
	]);
	for (const [locale, pages] of content) {
		files.set(llmsTxtPath(locale), buildLlmsTxt(locale, content, site));
		for (const rel of pages.keys()) {
			files.set(
				pageMarkdownPath(rel, locale),
				cleanMarkdown(pageSource(locale, rel, content)),
			);
		}
	}
	return files;
}

/**
 * Rebuild `src/routes/docs` and `src/routes/<locale>/docs`, plus the agent files in
 * `static/` (llms.txt, llms-full.txt, each page's `index.html.md`), from `content/`.
 * All generated and git-ignored.
 */
export function syncContentRoutes(root: string, site: SiteInfo): void {
	const content = withEnglishFallback(loadContent(join(root, "content")));
	for (const locale of ALL_LOCALES) {
		const prefix = locale === DEFAULT_LOCALE ? "" : locale;
		for (const dir of ["src/routes", "static"]) {
			rmSync(join(root, dir, prefix, "docs"), { recursive: true, force: true });
		}
	}
	const write = (out: string, text: string) => {
		mkdirSync(dirname(out), { recursive: true });
		writeFileSync(out, text);
	};
	for (const [locale, pages] of content) {
		for (const rel of pages.keys()) {
			write(
				join(root, "src/routes", contentRouteFile(rel, locale)),
				buildPage(locale, rel, content),
			);
		}
	}
	for (const { route, to } of folderRedirects(content)) {
		const dir = join(root, "src/routes", route);
		write(
			join(dir, "+page.ts"),
			`import { redirect } from "@sveltejs/kit";\n\n// Generated by vite/content-routes.ts: the folder URL opens its first page.\nexport const load = () => redirect(308, "${to}");\n`,
		);
		write(join(dir, "+page.svelte"), "");
	}
	for (const [path, text] of llmsFiles(content, site)) {
		write(join(root, "static", path), text);
	}
}

/** Syncs on creation and re-syncs while `vite dev` watches `content/`. */
export function contentRoutes(root: string, site: SiteInfo): Plugin {
	const contentDir = join(root, "content");
	// Sync while the plugin is created, not in `config()`: SveltePress/SvelteKit scan `src/routes`
	// when `sveltepress()` is called, so on a clean checkout the generated routes must exist by then.
	syncContentRoutes(root, site);
	return {
		name: "docs:content-routes",
		configureServer(server) {
			server.watcher.add(contentDir);
			const onChange = (file: string) => {
				if (file.startsWith(contentDir) && file.endsWith(".md")) {
					syncContentRoutes(root, site);
				}
			};
			server.watcher.on("add", onChange);
			server.watcher.on("change", onChange);
			server.watcher.on("unlink", onChange);
		},
	};
}
