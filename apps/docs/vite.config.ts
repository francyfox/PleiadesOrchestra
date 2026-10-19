import { join } from "node:path";
import adapter from "@sveltejs/adapter-static";
import { defaultTheme } from "@sveltepress/theme-default";
import { sveltepress } from "@sveltepress/vite";
import tailwindcss from "@tailwindcss/vite";
import { defineConfig, loadEnv } from "vite";
import { ALL_LOCALES, DEFAULT_LOCALE, type Locale } from "./src/lib/i18n.ts";
import {
	contentRoutes,
	loadContent,
	sidebarItems,
} from "./vite/content-routes.ts";

const root = import.meta.dirname;

/** The site header's words per language. */
const CHROME: Record<
	Locale,
	{ label: string; docs: string; playground: string; language: string }
> = {
	en: {
		label: "English",
		docs: "Docs",
		playground: "Playground",
		language: "Language",
	},
	ru: {
		label: "Русский",
		docs: "Документация",
		playground: "Песочница",
		language: "Язык",
	},
	kk: {
		label: "Қазақша",
		docs: "Құжаттама",
		playground: "Ойын алаңы",
		language: "Тіл",
	},
};

const navbar = (locale: Locale) => [
	{ title: CHROME[locale].docs, to: "/docs/" },
	{ title: CHROME[locale].playground, to: "/playground/" },
];

// The sources themselves (content/<locale>), not the generated routes.
const content = loadContent(join(root, "content"));
const sidebar = (locale: Locale) => ({
	"/docs/": sidebarItems(content.get(locale) ?? new Map()),
});

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
				navbar: navbar(DEFAULT_LOCALE),
				sidebar: sidebar(DEFAULT_LOCALE),
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
						"toml",
						"diff",
						"md",
					],
				},
			}),
			// SvelteKit 3 has no svelte.config.js: its options go through sveltepress().
			// One entry per route folder (src/routes, src/routes/ru, …): the theme
			// shows the language select in the header and keeps the page on switch.
			locales: Object.fromEntries(
				ALL_LOCALES.map((locale) => [
					locale === DEFAULT_LOCALE ? "/" : `/${locale}/`,
					{
						lang: locale,
						label: CHROME[locale].label,
						theme: {
							navbar: navbar(locale),
							sidebar: sidebar(locale),
							i18n: { localeSwitcher: CHROME[locale].language },
						},
					},
				]),
			),
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
						// Sveltia CMS: static/admin/index.html, served by the host, not a route.
						if (path === "/admin/") return;
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
