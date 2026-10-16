import { join } from "node:path";

/**
 * Static server for the built docs site (`apps/docs/build`) — the landing,
 * `/playground/` and the self-hosted WebMCP demos, at the site root exactly as
 * deployed (the pages use root-absolute asset paths, so it cannot be mounted
 * under a prefix). `playwright.config.ts` builds the site with a fake agent
 * URL and test keys first; the mocked tests intercept that origin.
 */
const PORT = 4311;
const buildDir = join(import.meta.dir, "..", "docs", "build");

Bun.serve({
	port: PORT,
	async fetch(request) {
		const { pathname } = new URL(request.url);
		const candidates = pathname.endsWith("/")
			? [`${pathname}index.html`]
			: [pathname, `${pathname}/index.html`, `${pathname}.html`];
		for (const candidate of candidates) {
			const file = Bun.file(join(buildDir, candidate));
			if (await file.exists()) return new Response(file);
		}
		return new Response("Not found", { status: 404 });
	},
});

console.log(`docs build on http://localhost:${PORT}`);
