# apps/docs internals

See root `CLAUDE.md` for monorepo commands, workflow, code style and repo-wide lessons.

## Stack

SveltePress (`@sveltepress/vite` + `@sveltepress/theme-default`) on SvelteKit 3 / Svelte 5, `adapter-static` (`build/`, fully prerendered, `trailingSlash = "always"`). SvelteKit 3 has no `svelte.config.js`: its options go through `sveltepress({ svelteKitOptions })` in `vite.config.ts`. Imports of own code use `#lib/*.js` (package `imports`; `$lib` is removed in Kit 3). Everything is in `devDependencies`; versions come from the root `workspaces.catalog`.

Run: `bun --cwd apps/docs run dev` (port 3004, listens on `[::1]`, open `http://localhost:3004`) or `cd apps/docs && bun run build` (`bun --cwd apps/docs run build` fails in this Bun; `bun run --cwd apps/docs build` works). `bun test src vite` for the unit tests.

E2E: `apps/e2e` tests the playground (`tests/playground*.spec.ts`). `bun run test:e2e` at the root; `cd apps/e2e && bunx playwright test playground` for the mocked ones. Playwright's second `webServer` builds this site with test env (fake agent URL, test keys from `tests/playground-env.ts`) and serves `build/` on :4311, so it overwrites `apps/docs/build`. Real-stack scenarios: `REAL_STACK=1 bunx playwright test playground-real` against `bun --cwd apps/docs run dev` with real keys in `.env`.

## Where things live

- `/`, `/ru/`, `/kk/` — landing: `src/routes/[[locale]]/+page.md` (frontmatter `layout: false` strips the docs chrome) renders `src/lib/components/landing/landing-page.svelte`. Copy per language in `src/lib/landing/content.ts` (`Record<Locale, LandingContent>`: a missing language is a type error; `i18n.ts` has `LOCALES`, `Locale`, `localizeHref`). No Intlayer: plain typed objects and per-locale Markdown. Adding a language = add it to `LOCALES`, an object in `content.ts`, a notice in `DocsLang.svelte`, a `content/<locale>/` tree. Language switch is in `[[locale]]/+layout.svelte`. `[[locale]]` has no matcher (a `=matcher` in the dir name breaks SveltePress page detection), so only the prerendered entries exist.
- `/playground/` — `src/lib/components/playground/` (iframe demo, widget panel, tools list, graph). Demo list and key lookup: `src/lib/playground/demos.ts`. Demos are static, self-contained and same-origin in `static/playground-demos/` (third-party: keep its `LICENSE` and `README.md`). Their `shared/webmcp-polyfill.js` is built from `packages/webmcp-polyfill` by `bun run polyfill` (runs before `dev`/`build`, git-ignored), so the demos run the polyfill the widget ships.
- `/docs/**`, `/ru/docs/**`, `/kk/docs/**` — pages are written per language in `content/<locale>/**/*.md` (`content/en/index.md` = `/docs/`, `content/ru/index.md` = `/ru/docs/`). `vite/content-routes.ts` mirrors them into `src/routes/docs/**` (en) and `src/routes/<locale>/docs/**` (generated, git-ignored, synced when the plugin is created and re-synced while `vite dev` runs; syncing in `config()` is too late, SveltePress scans routes earlier). Static `ru/docs` wins over `[[locale]]`, so the landing routes do not clash. Sidebar is auto-generated, one root per language (`roots` in `vite.config.ts`).
- Translations: same file names, same headings in the same order and count as `en` (the test enforces it). Write links as in English (`/docs/x/#Anchor`): the copy step rewrites `/docs/x/` to `/<locale>/docs/x/` and maps each anchor to the id of the heading at the same position in the translated target page (also same-page `#Anchor`); ids use the theme's rule (`[&#$?* :/]` -> `-`, case kept, `_` on duplicates; only plain text and inline code count). An unknown page or anchor throws. Frontmatter `review: pending` shows a notice at the top (`DocsLang.svelte`). Every page also gets the EN/RU/KK switch from `DocsLang.svelte`, injected by the copy step.
- Landing/playground styles: `src/lib/pleiades-site.css` — Tailwind v4 without preflight, tokens and a small reset scoped to `.po-site`, so nothing leaks into the docs pages. CSS in it hides the theme's sidebar/TOC on those pages (the theme renders them before the page sets its flags, so prerendered HTML can carry the previous page's sidebar).

## Env (`apps/docs/.env.example`)

Public, inlined into the bundle by `vite.config.ts` (`__PUBLIC_ENV__`; `$env/static/public` fails on unset vars and `$env/dynamic/*` can't be read while prerendering): `PUBLIC_PLEIADES_AGENT_URL` (orchestrator origin), `PUBLIC_PLEIADES_KEY` (shared fallback publishable key), `PUBLIC_PLEIADES_KEY_<DEMO>` (own channel per demo: `BASKETFUL`, `PIZZA_MAKER`, `EXPLAINER`, `FLIGHT_SEARCH`, `TICKET_BOOKING`, `HOTEL_CHAIN`). A demo without its own key uses the shared one and the widget panel calls `el.resetSession()` when the demo changes. Publishable keys only (`pk_`).

## Gotchas

- Prerender: 404s and missing `#id`s inside `/docs` are logged as `[docs]` warnings, not build failures (`handleHttpError`/`handleMissingId`). Read them after `build`.
- The theme's TOC store leaks the last docs page's anchors into prerendered landing/playground HTML; the missing-id warnings for those paths are ignored.
