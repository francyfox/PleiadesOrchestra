import { join } from "node:path";

/**
 * Static server for `fixtures/` (the test HTML pages) plus, under `/dist/`,
 * `packages/pleiades-widget`'s built bundle — the same artifact a real
 * integration would `<script src>`, not the source directly, so this
 * exercises what actually ships. Run `bun --cwd packages/pleiades-widget
 * run build` first (Playwright's `webServer` doesn't build it for you).
 */
const PORT = 4310;
const fixturesDir = join(import.meta.dir, "fixtures");
const widgetDistDir = join(
	import.meta.dir,
	"..",
	"..",
	"packages",
	"pleiades-widget",
	"dist",
);

Bun.serve({
	port: PORT,
	async fetch(request) {
		const url = new URL(request.url);
		const pathname = url.pathname === "/" ? "/widget.html" : url.pathname;
		const underDist = pathname.startsWith("/dist/");
		const root = underDist ? widgetDistDir : fixturesDir;
		const relative = underDist ? pathname.slice("/dist".length) : pathname;
		const file = Bun.file(join(root, relative));
		if (await file.exists()) return new Response(file);
		return new Response("Not found", { status: 404 });
	},
});

console.log(`e2e fixture server on http://localhost:${PORT}`);
