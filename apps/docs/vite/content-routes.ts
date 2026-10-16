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

/** One locale's pages: path relative to `content/<locale>/` (`/`-separated) -> Markdown. */
export type PageSet = Map<string, string>;

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

/** The `/docs/...` URL path (no locale) of a page. */
function docsPath(rel: string): string {
	const dir = contentRouteFile(rel, DEFAULT_LOCALE)
		.replace(/^docs\/?/, "")
		.replace(/\/?\+page\.md$/, "");
	return dir ? `/${dir}/` : "/";
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
	const md = content.get(locale)?.get(rel) ?? "";
	const body =
		locale === DEFAULT_LOCALE
			? md
			: rewriteLinks(md, {
					locale,
					self: rel,
					en: content.get(DEFAULT_LOCALE) ?? new Map(),
					own: content.get(locale) ?? new Map(),
				});
	const pending = parseFrontmatter(md).review === "pending";
	const header = [
		"<script>",
		"\timport DocsLang from '#lib/components/DocsLang.svelte'",
		"</script>",
		"",
		`<DocsLang locale="${locale}" path="${docsPath(rel)}" pending={${pending}} />`,
		"",
	].join("\n");
	const front = /^---\r?\n[\s\S]*?\r?\n---\r?\n?/.exec(body)?.[0] ?? "";
	return `${front}\n${header}\n${body.slice(front.length)}`;
}

/** Rebuild `src/routes/docs` and `src/routes/<locale>/docs` (generated, git-ignored) from `content/`. */
export function syncContentRoutes(root: string): void {
	const content = loadContent(join(root, "content"));
	for (const locale of ALL_LOCALES) {
		const prefix = locale === DEFAULT_LOCALE ? "" : locale;
		rmSync(join(root, "src/routes", prefix, "docs"), {
			recursive: true,
			force: true,
		});
	}
	for (const [locale, pages] of content) {
		for (const rel of pages.keys()) {
			const out = join(root, "src/routes", contentRouteFile(rel, locale));
			mkdirSync(dirname(out), { recursive: true });
			writeFileSync(out, buildPage(locale, rel, content));
		}
	}
}

/** Syncs on creation and re-syncs while `vite dev` watches `content/`. */
export function contentRoutes(root: string): Plugin {
	const contentDir = join(root, "content");
	// Sync while the plugin is created, not in `config()`: SveltePress/SvelteKit scan `src/routes`
	// when `sveltepress()` is called, so on a clean checkout the generated routes must exist by then.
	syncContentRoutes(root);
	return {
		name: "docs:content-routes",
		configureServer(server) {
			server.watcher.add(contentDir);
			const onChange = (file: string) => {
				if (file.startsWith(contentDir) && file.endsWith(".md")) {
					syncContentRoutes(root);
				}
			};
			server.watcher.on("add", onChange);
			server.watcher.on("change", onChange);
			server.watcher.on("unlink", onChange);
		},
	};
}
