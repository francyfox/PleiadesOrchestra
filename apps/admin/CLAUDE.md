# apps/admin internals

See root `CLAUDE.md` for commands, architecture overview and lessons.

## Stack

Svelte 5 SPA: shadcn-svelte, TanStack Table v9, TanStack Query v6 (`@tanstack/svelte-query`), `@xyflow/svelte` (Flow graphs), `@humanspeak/svelte-virtual-chat`, `adapter-static` (`fallback: index.html`), `ssr = false`, no server code at all. Talks to `apps/admin-api` through a typed Eden client (`$lib/api/client.ts`, types from `admin-api`'s `App`). Everything in **`devDependencies`** — static build, nothing installs at runtime.

Has a nested `apps/admin/biome.json` (extends root) that turns off unused-import/variable rules for `.svelte` files (Biome can't see usages in markup).

Same origin for `/api`: Caddy (`Caddyfile`, prod) or the dev-only `vite/dev-api-proxy.ts` (`ADMIN_API_URL`, default `http://localhost:3003`) forwards it; session cookie needs no CORS. Dev proxy also tunnels WebSocket upgrades on `/api/*`.

`bun --cwd apps/admin run dev` — `vite dev`. After adding a dependency: `rm -rf apps/admin/node_modules/.vite` + restart ("new version of pre-bundle"). `pkill -f "<pattern>"` in a Bash call whose own command line contains that pattern kills the calling shell — stop and start in separate calls.

## Data layer (TanStack Query)

One `queryClient` per tab (`src/lib/query/client.ts`). Defaults: `staleTime` 30 s, no refetch on window focus (sockets cover it), `retry` = `shouldRetry` (never on 4xx, once otherwise). `prefetch()` in `load` uses `retry: false` — dead server shows error page immediately.

`queries.ts`: `liveQueries.<topic>(params)` (key = `topicKey(topic, params)`, `staleTime: Infinity`) and `queries.*` (session, system, allChannels for selects). Query functions call Eden through `unwrap()` (`api/result.ts`), which throws `ApiError(status, body)`.

`load` functions in `+page.ts` only parse the URL and `prefetch()` queries into the cache; the root `+layout.ts` fetches `GET /api/session` with `staleTime: 0` on every navigation.

`useActionEnhance({ run })` (`$lib/components/use-action-enhance.ts`) — a `use:` action that runs a handler from `$lib/actions.ts` as a `createMutation`, toasts the result and calls `queryClient.invalidateQueries()`. `startsSession` in `actions.ts` empties the cache on sign-in/register.

TanStack Devtools (`@tanstack/svelte-query-devtools`, button bottom-left) mounted in root `+layout.svelte` behind `{#if import.meta.env.DEV}` with a dynamic import — gating with `dev` from `$app/environment` left the devtools chunk in prod builds.

`queryOptions` is exported by `@tanstack/svelte-query`, **not** `@tanstack/query-core`. Pure modules that bun tests import must use `query-core`; `queries.ts` and hooks use svelte-query.

## Live admin pages

`GET /api/live` — one multiplexed WebSocket per tab (protocol in `admin-api/src/modules/live/live.types.ts`). Browser subscribes per page (`subscribe {id, topic, params}` / `unsubscribe`). Client: `apps/admin/src/lib/live/` (`live-client.ts` — lazy socket, closed while tab is hidden or nothing subscribed, resubscribes on reconnect; `use-live-query.svelte.ts` — `useLiveQuery(topic, params)` = `createQuery` + `bindLiveTopic` that writes every push into the cache with `setQueryData`). Swaps DATA; never re-runs `load` or reloads the page.

**Connection toasts** (svelte-sonner): `reportConnection(problem, source, down)` (`lib/live/connection.ts`) receives raw up/down from the live socket, system socket, subscription `upstream` errors, and every HTTP request via `withConnectionReport`. `connection-monitor.ts` debounces 2 s; `layout/connection-toasts.svelte` (ru/en/kk) shows one persistent error toast per problem + a 3 s "restored" toast.

Testing gotcha: SIGTERM on admin-api does NOT drop open sockets (graceful shutdown waits) — use `kill -9` to simulate an outage. After backend changes: `docker compose up -d --build admin-api` (old image answers 404 for `/api/live`). Parallel `bun install` forks can leave `apps/admin/node_modules` half-populated (`svelte-kit: command not found`) — rerun `bun install` at the root.

## Tables, actions, forms conventions

Every table is `DataTable` (`lib/components/data-table.svelte`): 10 rows per page (`DEFAULT_PAGE_SIZE`). Client-side paging by default; server-side via `server` prop (`?page=` in URL, `parsePage`). Long cells cut with ellipsis, wide tables scroll sideways.

Row actions: bright `IconButton`s (tooltip = accessible name; tones primary/success/warning/danger). Deletes and key rotation go through `ConfirmDialog`. Keys/ids/URLs get a prefix copy icon (`CopyValue`/`CopyButton`). Growing pickers use `search-select.svelte` (Popover + search box, capped to 16rem, arrows/Enter/Escape).

Creating items: «+ Add» button opens a dialog (`create-*-dialog.svelte`); `useXxxEnhance` takes `onDone` that runs only on success (failed submit keeps the dialog open).

List pages with item detail have a `[id]` route built on `page-header.svelte` (back link, title, meta badges, `controls` snippet). Flow list filters: `?status=&intent=&page=` in URL, `lib/flow-filters.ts`; intent list there duplicates core's `TOOL_INTENTS`. Status filter is server-side (computed from the live registry + clock, not a DB column).

## Pages

- `/flow` — Flow request list (formerly `/goap`). `/flow/[id]` — request detail: `@xyflow/svelte` graph, nodes `prompt → translate → understand → steps → result`, running node counts up client-side. Live topics: `requests` (3 s) / `request` (1 s). Row click opens request (`DataTable` `onRowClick`, `?id=` in URL).
- `/mcp/[id]` — WebMCP catalog: sites table → functions table with spelled-out parameters (`describeTool`).
- `/intents` — Intent examples: approve / reject / correct Laya's pending answers. Correction = admin's label, approved immediately, rebuilds channel model.
- `/performance` — p50/p90/p99 charts per model kind (including Translation tab). `/recommendations` — Lighthouse-style audit (`lib/system/audit.ts`, scores against `IDEAL_MACHINE = 100`), client-side on cached system snapshot.
- `/faq` — Getting started + Q&A. 300 px fixed-height question list virtualized with `@tanstack/svelte-virtual` (44 px rows, arrows/Home/End). Search: Fuse.js fuzzy from 3 chars, plain substring for 1–2 chars. Code samples via `CodeBlock` → Prism (markup + bash, token colours in `code-block.svelte`).
- `/channels` — channel list with **Embed code** dialog (`embed-dialog.svelte`, `lib/embed-snippet.ts`, refuses `sk_` keys).
- The header meter (`system-meter.svelte`) shows green/yellow/red badges (`lib/system/load-level.ts`: <70 / 70–90 / ≥90, integrated GPU judged by GTT) fed by `/api/system/stream` WebSocket (`use-system-snapshot.svelte.ts`, runed's `IsDocumentVisible`: socket closed while tab hidden).

## i18n (Intlayer)

ru default / en / kk. Every UI string in a `*.content.ts` dictionary (`t({ ru, en, kk })`, `insert()` for params; `strictMode: "strict"` makes a missing language a type error) next to its components under `src/lib/components/<feature>/`. No URL prefixes (`routing.mode: "no-prefix"`): locale resolved client-side in root `+layout.ts` (`browser-locale.ts`), `setupIntlayer(data.locale)` called **synchronously** in root `+layout.svelte` before any child calls `useIntlayer`.

`admin-api` returns error **codes** (`{ error: "weak_password", min: 8 }`), never text — client localizes. Numbers/dates/ms/GB via `useFormat()` (`lib/i18n/format.ts`, Intl-based). TanStack column headers must be functions (`header: () => $content.x.value`), not strings, or they won't follow a locale switch.

Dev gotcha: vite-intlayer rewrites every `.intlayer/dictionary/*.json` on content change, Vite sends one `full-reload` per file — 18–46 reloads/second. Fixed by `vite/coalesce-intlayer-reloads.ts` (swallows per-file reloads under `.intlayer/`, one debounced `full-reload`).

## Theme / fonts

Tweakcn theme in `src/routes/layout.css`. `--font-sans: "Oxanium Variable", "Exo 2 Variable", sans-serif` — Oxanium has no Cyrillic; ru/kk text falls through to Exo 2. Check Cyrillic + Cyrillic-ext coverage before swapping fonts. Fonts are self-hosted `@fontsource-variable/*`.

`shadcn-svelte Card.Content` ("vega" style) is `flex flex-col` by default — add `flex-row` explicitly when needed.
