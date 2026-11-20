// Fills <lastmod> in the built sitemap.xml from the git history of each page's source file.
// SveltePress regenerates static/sitemap.xml on every build and has no lastmod support, so this
// runs after `vite build` and edits build/sitemap.xml. Needs full git history (CI: fetch-depth 0);
// without it the sitemap is left as is.
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const ROOT = join(import.meta.dir, "..");
const SITEMAP = join(ROOT, process.argv[2] ?? "build/sitemap.xml");

const gitDate = (file: string): string | undefined => {
	const out = Bun.spawnSync(["git", "log", "-1", "--format=%cs", "--", file], {
		cwd: ROOT,
	})
		.stdout.toString()
		.trim();
	return out || undefined;
};

/** Source files a URL is built from, most specific first. */
function sources(pathname: string): string[] {
	const [, first, ...rest] = pathname.split("/");
	const lang = first === "ru" || first === "kk" ? first : "en";
	const parts = (lang === "en" ? [first, ...rest] : rest).filter(Boolean);
	const route = (l: string) =>
		(l === "en" ? ["src/routes", ...parts] : ["src/routes", l, ...parts]).join(
			"/",
		);

	if (parts[0] === "docs") {
		const doc = parts.slice(1).join("/") || "intro";
		return [lang, "en"].flatMap((l) => [
			`content/${l}/${doc}.md`,
			`content/${l}/${doc}/index.md`,
			`content/${l}/${doc}/overview.md`,
			`content/${l}/${doc}`,
		]);
	}
	return [lang, "en"].flatMap((l) => [
		`${route(l)}/+page.md`,
		`${route(l)}/+page.svelte`,
	]);
}

// A shallow clone has one commit: every page would get the same (wrong) date.
const shallow = Bun.spawnSync(["git", "rev-parse", "--is-shallow-repository"], {
	cwd: ROOT,
})
	.stdout.toString()
	.trim();
if (shallow !== "false") {
	console.warn("shallow or missing git history, sitemap <lastmod> skipped");
	process.exit(0);
}

const xml = readFileSync(SITEMAP, "utf8");
const dates = new Map<string, string>();
const out = xml.replace(
	/<loc>([^<]+)<\/loc>(\s*<lastmod>[^<]*<\/lastmod>)?/g,
	(_whole, loc: string) => {
		const file = sources(new URL(loc).pathname).find((f) =>
			existsSync(join(ROOT, f)),
		);
		const date = file && (dates.get(file) ?? gitDate(file));
		if (!date) {
			console.warn(`no source/history for ${loc}, <lastmod> left out`);
			return `<loc>${loc}</loc>`;
		}
		dates.set(file, date);
		return `<loc>${loc}</loc>\n    <lastmod>${date}</lastmod>`;
	},
);
writeFileSync(SITEMAP, out);
console.log(`lastmod written for ${out.match(/<lastmod>/g)?.length ?? 0} URLs`);
