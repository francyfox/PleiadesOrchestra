import { join } from "node:path";
import adapter from "@sveltejs/adapter-static";
import { defaultTheme } from "@sveltepress/theme-default";
import { sveltepress } from "@sveltepress/vite";
import tailwindcss from "@tailwindcss/vite";
import { defineConfig, loadEnv } from "vite";
import { ALL_LOCALES, DEFAULT_LOCALE, type Locale } from "./src/lib/i18n.ts";
import { PLEIADES_PANEL_LOGIN_URL, SITE } from "./src/lib/site.ts";
import {
	contentRoutes,
	DRAFTS_DIR,
	loadContent,
	sidebarItems,
} from "./vite/content-routes.ts";
import { mobileSearch } from "./vite/mobile-search.ts";

const root = import.meta.dirname;

/** The site header's words per language. */
const CHROME: Record<
	Locale,
	{
		label: string;
		docs: string;
		playground: string;
		panel: string;
		language: string;
	}
> = {
	en: {
		label: "English",
		docs: "Docs",
		playground: "Playground",
		panel: "Panel",
		language: "Language",
	},
	ru: {
		label: "Русский",
		docs: "Документация",
		playground: "Песочница",
		panel: "Панель",
		language: "Язык",
	},
	kk: {
		label: "Қазақша",
		docs: "Құжаттама",
		playground: "Ойын алаңы",
		panel: "Панель",
		language: "Тіл",
	},
};

/**
 * A navbar label with a Lucide icon (paths from @lucide/svelte, ISC). The theme renders a
 * string `icon` as HTML in place of the title, so the title goes inside it too;
 * `po-nav-icon` undoes the theme's icon-only styling (site-header.css).
 */
const withIcon = (paths: string[], title: string) =>
	`<svg class="po-nav-icon" xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${paths.map((d) => `<path d="${d}"/>`).join("")}</svg><span>${title}</span>`;

const ICONS = {
	bookOpen: [
		"M12 5v16",
		"M20.001 19A2 2 0 0022 17V5a2 2 0 00-1.999-2L16 3.002A5 5 0 0012 5a5 5 0 00-4-2H4a2 2 0 00-2 2v12a2 2 0 001.999 2H8a5 5 0 014 2 5 5 0 014-2z",
	],
	flaskConical: [
		"M14 2v6a2 2 0 0 0 .245.96l5.51 10.08A2 2 0 0 1 18 22H6a2 2 0 0 1-1.755-2.96l5.51-10.08A2 2 0 0 0 10 8V2",
		"M6.453 15h11.094",
		"M8.5 2h7",
	],
	logIn: [
		"m10 17 5-5-5-5",
		"M15 12H3",
		"M15 3h4a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-4",
	],
};

const navbar = (locale: Locale) => [
	{
		title: CHROME[locale].docs,
		to: "/docs/",
		icon: withIcon(ICONS.bookOpen, CHROME[locale].docs),
	},
	{
		title: CHROME[locale].playground,
		to: "/playground/",
		icon: withIcon(ICONS.flaskConical, CHROME[locale].playground),
	},
	{
		title: CHROME[locale].panel,
		to: PLEIADES_PANEL_LOGIN_URL,
		external: true,
		icon: withIcon(ICONS.logIn, CHROME[locale].panel),
	},
];

// The sources themselves (content/<locale>), not the generated routes.
const content = loadContent(join(root, "content"));
// Two groups, not a flat list: the theme draws every top-level item as its own group
// (bold title, rule, wide gaps). Drafts are English-only working notes, folded.
const sidebar = (locale: Locale) => {
	const items = sidebarItems(content.get(locale) ?? new Map());
	const isDraft = (item: { to: string }) =>
		item.to.startsWith(`/docs/${DRAFTS_DIR}`);
	const drafts = items.filter(isDraft);
	return {
		"/docs/": [
			{ title: CHROME[locale].docs, items: items.filter((i) => !isDraft(i)) },
			...(drafts.length
				? [{ title: "Drafts", collapsible: true, items: drafts }]
				: []),
		],
	};
};

export default defineConfig(({ mode }) => ({
	define: {
		// Playground channel config (PUBLIC_PLEIADES_*), read in the browser. `$env/static/public`
		// would fail the build when a key is unset and `$env/dynamic/*` can't be read while
		// prerendering, so the public vars are inlined here.
		__PUBLIC_ENV__: JSON.stringify(loadEnv(mode, root, "PUBLIC_")),
	},
	// packages/ui assets (images) are imported from outside the app root.
	server: { fs: { allow: [join(root, "../../packages/ui")] } },
	// JS already has source maps in dev; CSS (Tailwind, Svelte styles) needs this.
	css: { devSourcemap: true },
	plugins: [
		// Docs pages live in content/<locale>/*.md; mirrored into src/routes/{,<locale>/}docs for SveltePress,
		// plus llms.txt, llms-full.txt and each page's Markdown in static/ (llmstxt.org).
		contentRoutes(root, SITE),
		mobileSearch(),
		tailwindcss(),
		sveltepress({
			siteConfig: SITE,
			theme: defaultTheme({
				github: "https://github.com/francyfox/PleiadesOrchestra",
				// The theme shows it with the site title next to it (navbar, sidebar).
				logo: "/logo.svg",
				// Uno colours compiled into the theme: token references, so packages/ui drives them.
				// `light`/`dark` are the <meta name="theme-color"> values and must be literal (--background).
				themeColor: {
					light: "#ffffff",
					dark: "#30281d",
					primary: "var(--primary)",
					primaryDeep: "var(--primary)",
					hover: "var(--primary-shade)",
					gradient: { start: "var(--primary)", end: "var(--primary-shade)" },
				},
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
