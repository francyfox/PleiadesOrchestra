import adapter from "@sveltejs/adapter-static";
import { defaultTheme } from "@sveltepress/theme-default";
import { sveltepress } from "@sveltepress/vite";
import tailwindcss from "@tailwindcss/vite";
import { defineConfig, loadEnv } from "vite";
import { LOCALES } from "./src/lib/i18n.ts";
import { contentRoutes } from "./vite/content-routes.ts";

const root = import.meta.dirname;

export default defineConfig(({ mode }) => ({
	define: {
		// Playground channel config (PUBLIC_PLEIADES_*), read in the browser. `$env/static/public`
		// would fail the build when a key is unset and `$env/dynamic/*` can't be read while
		// prerendering, so the public vars are inlined here.
		__PUBLIC_ENV__: JSON.stringify(loadEnv(mode, root, "PUBLIC_")),
	},
	plugins: [
		// Docs pages live in content/<locale>/*.md; mirrored into src/routes/{,<locale>/}docs for SveltePress.
		contentRoutes(root),
		tailwindcss(),
		sveltepress({
			siteConfig: {
				title: "PleiadesOrchestra",
				description:
					"Open-source GOAP orchestrator for tiny models: a website chatbot that works through MCP and WebMCP tools.",
			},
			theme: defaultTheme({
				github: "https://github.com/francyfox/PleiadesOrchestra",
				navbar: [
					{ title: "Docs", to: "/docs/" },
					{ title: "Playground", to: "/playground/" },
				],
				// One sidebar tree per language: the roots are the generated docs route folders.
				sidebar: {
					enabled: true,
					roots: ["/docs/", ...LOCALES.map((l) => `/${l}/docs/`)],
				},
				highlighter: {
					languages: [
						"html",
						"css",
						"js",
						"ts",
						"json",
						"sh",
						"bash",
						"svelte",
						"yaml",
						"diff",
						"md",
					],
				},
			}),
			// SvelteKit 3 has no svelte.config.js: its options go through sveltepress().
			svelteKitOptions: {
				compilerOptions: {
					// Force runes mode for the project, except for libraries.
					runes: ({ filename }) =>
						filename.split(/[/\\]/).includes("node_modules") ? undefined : true,
				},
				adapter: adapter({ pages: "build", assets: "build", strict: true }),
				prerender: {
					entries: ["*"],
					// Broken links in content/ must not fail the build of the landing; they are
					// logged as warnings instead.
					handleMissingId: ({ path, id, referrers }) => {
						// The theme's TOC store leaks the last docs page's anchors into prerendered
						// non-docs pages (landing, playground); those are not real broken links.
						if (!path.startsWith("/docs")) return;
						console.warn(
							`[docs] no #${id} on ${path} (linked from ${referrers.join(", ")})`,
						);
					},
					handleHttpError: ({ status, path, referrer, message }) => {
						if (status === 404) {
							console.warn(
								`[docs] 404 ${path} (linked from ${referrer ?? "?"})`,
							);
							return;
						}
						throw new Error(message);
					},
				},
			},
		}),
	],
}));
