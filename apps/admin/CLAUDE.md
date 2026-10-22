# apps/admin internals

See root `CLAUDE.md` for monorepo commands, workflow, code style and repo-wide lessons.

## Stack

Svelte 5 SPA: shadcn-svelte, TanStack Table v9, TanStack Query v6 (`@tanstack/svelte-query`), `@xyflow/svelte` (Flow graphs), `@humanspeak/svelte-virtual-chat`, `adapter-static` (`fallback: index.html`), `ssr = false`, no server code at all. Talks to `apps/admin-api` through a typed Eden client (`#lib/api/client.ts`, types from `admin-api`'s `App`). Everything in **`devDependencies`** — static build, nothing installs at runtime.

Has a nested `apps/admin/biome.json` (extends root) that turns off unused-import/variable rules for `.svelte` files (Biome can't see usages in markup).

Same origin for `/api`: Caddy (`Caddyfile`, prod) or the dev-only `vite/dev-api-proxy.ts` (`ADMIN_API_URL`, default `http://localhost:3003`) forwards it; session cookie needs no CORS. Dev proxy also tunnels WebSocket upgrades on `/api/*`.

`bun --cwd apps/admin run dev` — `vite dev`. After adding a dependency: `rm -rf apps/admin/node_modules/.vite` + restart ("new version of pre-bundle"). `pkill -f "<pattern>"` in a Bash call whose own command line contains that pattern kills the calling shell — stop and start in separate calls.

**TypeScript 6 is required** — two TS versions make Bun link two copies of `elysia`, which breaks Eden's `Treaty` type check. Build: `bun --cwd apps/admin run build` (`bun --bun vite build` -> `build/`, `adapter-static`).

## Data layer (TanStack Query)

One `queryClient` per tab (`src/lib/query/client.ts`). Defaults: `staleTime` 30 s, no refetch on window focus (sockets cover it), `retry` = `shouldRetry` (never on 4xx, once otherwise). `prefetch()` in `load` uses `retry: false` — dead server shows error page immediately.

`queries.ts`: `liveQueries.<topic>(params)` (key = `topicKey(topic, params)`, `staleTime: Infinity`) and `queries.*` (session, system, allChannels for selects). Query functions call Eden through `unwrap()` (`api/result.ts`), which throws `ApiError(status, body)`.

`load` functions in `+page.ts` only parse the URL and `prefetch(fetch, query)` queries into the cache — `fetch` is `load`'s own; `prefetch` runs the query function under `withFetch` (`api/client.ts`) so `api()` uses it (a `window.fetch` call inside `load` warns `window_fetch_in_load` in dev); the root `+layout.ts` fetches `GET /api/session` with `staleTime: 0` on every navigation.

`useActionEnhance({ run })` (`#lib/components/use-action-enhance.ts`) — a `use:` action that runs a handler from `#lib/actions.ts` as a `createMutation`, toasts the result and calls `queryClient.invalidateQueries()`. `startsSession` in `actions.ts` empties the cache on sign-in/register.

TanStack Devtools (`@tanstack/svelte-query-devtools`, button top-right: the bottom corners are taken by Sentry feedback and the sidebar) mounted in root `+layout.svelte` behind `{#if import.meta.env.DEV}` with a dynamic import — gating with `dev` from `$app/environment` left the devtools chunk in prod builds.

`queryOptions` is exported by `@tanstack/svelte-query`, **not** `@tanstack/query-core`. Pure modules that bun tests import must use `query-core`; `queries.ts` and hooks use svelte-query.

## Live admin pages

`GET /api/live` — one multiplexed WebSocket per tab (protocol in `admin-api/src/modules/live/live.types.ts`). Browser subscribes per page (`subscribe {id, topic, params}` / `unsubscribe`). Client: `apps/admin/src/lib/live/` (`live-client.ts` — lazy socket, closed while tab is hidden or nothing subscribed, resubscribes on reconnect; `use-live-query.svelte.ts` — `useLiveQuery(topic, params)` = `createQuery` + `bindLiveTopic` that writes every push into the cache with `setQueryData`). Swaps DATA; never re-runs `load` or reloads the page.

**Connection toasts** (svelte-sonner): `reportConnection(problem, source, down)` (`lib/live/connection.ts`) receives raw up/down from the live socket, system socket, subscription `upstream` errors, and every HTTP request via `withConnectionReport`. `connection-monitor.ts` debounces 2 s; `layout/connection-toasts.svelte` (ru/en/kk) shows one persistent error toast per problem + a 3 s "restored" toast.

Testing gotcha: SIGTERM on admin-api does NOT drop open sockets (graceful shutdown waits) — use `kill -9` to simulate an outage. After backend changes: `docker compose up -d --build admin-api` (old image answers 404 for `/api/live`). Parallel `bun install` forks can leave `apps/admin/node_modules` half-populated (`svelte-kit: command not found`) — rerun `bun install` at the root.

## Tables, actions, forms conventions

**Dumb first, smart after**: a presentational component (props in, markup out, no stores/i18n/queries) is built first and lives in `src/lib/components/ui/<name>/` (`<name>.svelte` + `index.ts`); feature templates compose it and carry the logic. Older ones in `lib/components/` root (`search-select`, `compact-number`) predate this.

Every table is `DataTable` (`lib/components/data-table.svelte`): 10 rows per page (`DEFAULT_PAGE_SIZE`). Client-side paging by default; server-side via `server` prop (`?page=` in URL, `parsePage`). Long cells cut with ellipsis, wide tables scroll sideways.

Row actions: bright `IconButton`s (tooltip = accessible name; tones primary/success/warning/danger). Deletes and key rotation go through `ConfirmDialog`. Keys/ids/URLs get a prefix copy icon (`CopyValue`/`CopyButton`). Growing pickers use `search-select.svelte` (Popover + search box, capped to 16rem, arrows/Enter/Escape).

Creating items: «+ Add» button opens a dialog (`create-*-dialog.svelte`); `useXxxEnhance` takes `onDone` that runs only on success (failed submit keeps the dialog open).

List pages with item detail have a `[id]` route built on `page-header.svelte` (back link, title, meta badges, `controls` snippet). Flow list filters: `?status=&intent=&page=` in URL, `lib/flow-filters.ts`; intent list there duplicates core's `TOOL_INTENTS`. Status filter is server-side (computed from the live registry + clock, not a DB column).

## Forms: required marker and validation

One pipeline, schemas written once: TypeBox in `admin-api/src/forms/` (`admin-api/forms`, typebox only; also the route bodies) -> `toZod` (`z.fromJSONSchema`, cached) + `formDataToObject` (`lib/forms/schema-to-zod.ts`: trim, empty optional left out, numbers/arrays/booleans/JSON objects typed from the schema) -> `parseForm(schema, form)` (`lib/forms/field-errors.ts`: `{ ok, body }` typed `Static<schema>`, or one `FieldError` per field; a FormData is parsed once) -> `useActionEnhance({ schema })` (validates, sends nothing on errors, `.errors` store + `.clear(name)`; an `input`/`change` clears that field's error). The action in `actions.ts` calls `parseForm` again (cached) and sends `body` as is; keep a hand-written step only where an input really differs from the wire value, via `overrides` (`{ field: (form) => wireValue }`, same object to the enhance and `parseForm`).

Rules: every required value gets `required` on its `Label`/`FormField` (red ` *`, aria-hidden) and the form gets `novalidate` (native tooltips would hide ours). Messages: `FormField error={$errorText($errors?.name)}` or `<FieldError>` (`ui/field-error`) under the control; text from `useFieldErrorText()` (`common.fieldError`, ru/en/kk). References: `models/model-dialog.svelte`, `provider-dialog.svelte`.

## Pages

- `/visitors` — chat visitors (formerly `/users`; "users" will mean paying accounts). Table shows the generated `name` (`adjective_animal_xxxxxx`), `displayName` for identified ones and the id with `CopyValue`; `/visitors/[id]` has the same name and a copy-id chip. Components in `lib/components/visitors` and `visitor-detail`, URL table state in `lib/visitors-table-state.ts`, live topics `visitors` / `visitor`.
- `/flow` — Flow request list (formerly `/goap`). `/flow/[id]` — request detail: `@xyflow/svelte` graph, nodes `prompt → translate → understand → steps → result`, running node counts up client-side. Live topics: `requests` (3 s) / `request` (1 s). Row click opens request (`DataTable` `onRowClick`, `?id=` in URL).
- `/mcp/[id]` — WebMCP catalog: sites table → functions table with spelled-out parameters (`describeTool`).
- `/intents` — Intent examples: approve / reject / correct Laya's pending answers. Correction = admin's label, approved immediately, rebuilds channel model.
- `/performance` — p50/p90/p99 charts per model kind (including Translation tab). `/recommendations` — Lighthouse-style audit (`lib/system/audit.ts`, scores against `IDEAL_MACHINE = 100`), client-side on cached system snapshot.
- `/faq` — Getting started + Q&A. 300 px fixed-height question list virtualized with `@tanstack/svelte-virtual` (44 px rows, arrows/Home/End). Search: Fuse.js fuzzy from 3 chars, plain substring for 1–2 chars. Code samples via `CodeBlock` → Prism (markup + bash, token colours in `code-block.svelte`).
- `/plans` — Polar subscriptions (`?status=` filter, plans expiring within 7 days first; owner shown as `accountEmail`, falling back to the account id). The channels list has a plan column. The dashboard shows spend (`costUsd`) per day, channel and model, and for staff a row of money tiles (`dashboard/finance-summary.svelte`: model spend, revenue, losses, net profit; negative in red) when the payload has `finance`; model prices come from OpenRouter via the orchestrator.
- `/agents` — agents with health; the settings dialog only picks a model (the list is filtered by model types: gamma-decision takes models whose types include `decision`, the rest `language`; a `translation` model is never offered); the in-process translator row (role `translate`) is read-only, no dialog. `/models` — providers (a provider of only translation models shows «in-process» instead of a URL; the Decisions URL field sets where its decision models are asked) and models of the orchestrator's `providers.toml`: two `DataTable`s (the models one has a tab per type with its icon, a types column of icon badges and a types multi-select with search in its dialog, `ui/search-multi-select`; type names and icons: `lib/model-types.ts`, `lib/model-type-icons.ts`) with edit/delete, «+ Provider» / «+ Model» dialogs, and the raw file in a lazily loaded CodeMirror 6 modal (keys masked; «Check» / Alt+Shift+L asks `POST /api/providers-toml/check`, errors with a line become lint markers, path-only ones a list; `lib/toml-check.ts`).
- `/channels` — channel list with **Embed code** dialog (`embed-dialog.svelte`, `lib/embed-snippet.ts`, refuses `sk_` keys). Customers see only their own channels (server-scoped) without plan/owner columns; staff get an Owner column (`lib/owner-label.ts`, names from `GET /api/accounts`, "staff" when `ownerId` is null). The dashboard is the same page for both.
- `/billing` (customers only, like `/settings`) — plan + status + expiry, TR balance (`format.tr`, negative = overdraft badge), checkout / top-up (whole USD 1..10000) / portal forms through `useBillingEnhance` (success = `location.assign(url)`; a 503 `billing_unavailable` disables the buttons with a neutral notice), orders and monthly spend tables (`lib/components/billing`); `?checkout=success` toasts and invalidates. **Header alert**: `billing/standing-alert.svelte` (customers only; staff get 403) polls `queries.standing()` every 60 s, `standingAlert()` (`lib/billing-alert.ts`) picks red (paused) / yellow (`warn`) and the text, linking to `/billing`. The channels list shows a "paused" badge from the same query (customer view only; the channel list carries no owner standing for staff).
- `/users` (staff) — customer accounts, server-paged `GET /api/accounts` (plain query, not a live topic): ban/unban, a wallet button opening the customer's billing (`GET /api/accounts/:id/billing`, fetched only when the dialog opens: one request, not one per row), delete (`ConfirmDialog`: removes the account and its channels). `submitted` turns a 502/503 without an error code into `upstream_unavailable`.
- `/settings` (customers only; staff are redirected to `/`) — name, email change (mail link to the new address), inactivity note from `lastActiveAt`, **Danger zone**: delete account, submit enabled when the typed email matches (`lib/confirm-email.ts`: trim + case-insensitive, like the server); success clears the cache and does a full load of `/user/login`.
- The header meter (`system-meter.svelte`) shows green/yellow/red badges (`lib/system/load-level.ts`: <70 / 70–90 / ≥90, integrated GPU judged by GTT) fed by `/api/system/stream` WebSocket (`use-system-snapshot.svelte.ts`, runed's `IsDocumentVisible`: socket closed while tab hidden).

## Sign-in and levels

The session (`GET /api/session`) carries `admin.level` (0 super admin, 100 admin, 200 user; `lib/auth-redirect.ts` has `isStaff` and mirrors the server's `<= 100`). Routes, all in `routes/(auth)/`: `/login` is the **staff token** form (no password; shows the `admin:create` hint while `setupRequired`), `/user/login`, `/user/register`, `/user/forgot`, `/user/reset?token=` are the customer forms (the verification mail lands on `/user/login?verified=1|0`). The forms share `components/auth/auth-form.svelte.ts` (`useAuthForm`, `authErrorText` for error codes, ru/en/kk in `(auth)/auth.content.ts`).

`resolveAuthRedirect({ pathname, level })` runs in the root `+layout.ts`: anonymous → only the five forms; a signed-in account leaves them for `/`; a customer (200) may open only `/`, `/channels`, `/visitors`, `/flow`, `/blocked-ips`, `/faq`, `/settings`, `/billing` (`canOpen`; the server scopes the data to their channels; the block-IP dialog has no "all channels" option for them; `/settings` is customer-only, staff are sent `/`, also what the sidebar filters its items by) and is sent `/` from anything else. For a customer the header system meter is not mounted, the `(app)` layout prefetches no `/api/system`. A customer's pages subscribe only to the `dashboard`, `channels`, `visitors`, `visitor`, `requests`, `request`, `blocked-ips` live topics (anything else is `forbidden`).

Admins page: «+ Add» takes name + email, the response carries the access token **once** (`token-dialog.svelte`, `CopyValue`); row actions are edit name/email, rotate token (`ConfirmDialog`; rotating your own ends your sessions, so closing the token dialog goes to `/login`), ban, delete. A level badge (super admin / admin) sits next to the name.

## i18n (Intlayer)

en default / ru / kk. Every UI string in a `*.content.ts` dictionary (`t({ ru, en, kk })`, `insert()` for params; `strictMode: "strict"` makes a missing language a type error) next to its components under `src/lib/components/<feature>/`. No URL prefixes (`routing.mode: "no-prefix"`): locale resolved client-side in root `+layout.ts` (`browser-locale.ts`), `setupIntlayer(data.locale)` called **synchronously** in root `+layout.svelte` before any child calls `useIntlayer`.

`admin-api` returns error **codes** (`{ error: "weak_password", min: 8 }`), never text — client localizes. Numbers/dates/ms/GB via `useFormat()` (`lib/i18n/format.ts`, Intl-based). TanStack column headers must be functions (`header: () => $content.x.value`), not strings, or they won't follow a locale switch.

Dev gotcha: vite-intlayer rewrites every `.intlayer/dictionary/*.json` on content change, Vite sends one `full-reload` per file — 18–46 reloads/second. Fixed by `vite/coalesce-intlayer-reloads.ts` (swallows per-file reloads under `.intlayer/`, one debounced `full-reload`). SvelteKit narrows `server.fs.allow` to `src`/`node_modules`/`.svelte-kit`, so `vite.config.ts` adds `.intlayer` (otherwise "outside of Vite serving allow list" on a dictionary JSON).

## Sentry

`@sentry/sveltekit` (own Sentry project): `hooks.client.ts` inits it only when `VITE_SENTRY_DSN` is set (baked in at build time; `apps/admin/.env` in dev), `tracesSampleRate: 1`, and wraps `handleError` in `handleErrorWithSentry`. `sentrySvelteKit({ autoUploadSourceMaps: false })` in `vite.config.ts` (import from `@sentry/sveltekit/vite`; before `sveltekit()`) wraps load functions in spans. `/api` calls are same-origin, so they carry `sentry-trace` and join admin-api's trace. Events go through `tunnel: "/api/monitoring/tunnel"` (admin-api forwards them; needs `SENTRY_TUNNEL_DSN` there = this DSN), so ad blockers don't drop them. Feedback: `feedbackIntegration({ autoInject: false })`, the button is created by `layout/feedback-widget.svelte` (bottom right; texts in `feedback-widget.content.ts`, rebuilt on locale switch; theme follows mode-watcher; `Sentry.setUser` from the session).

## Theme / fonts

The design system is `packages/ui` (`@repo/ui`; tokens, fonts, Tailwind bridge, background photo; see its CLAUDE.md) — edit colours/fonts/gradients there, not here. `src/routes/layout.css` imports `@repo/ui/fonts.css`, `tokens.css`, `tailwind.css` and keeps only the base layer: `body` takes `var(--page-background)` (glows + the autumn photo at `--photo-opacity`), plain links turn primary on hover. `Sidebar.Inset` is `bg-transparent` so the page background shows. Panel-specific choices live in the shadcn components: default buttons and the active sidebar item are `bg-gradient-primary` (the active item's text is `primary-foreground`, it pairs with the gradient), `Card` is `bg-gradient-card` with `odd:bg-gradient-card-odd`, the sidebar `bg-gradient-sidebar`, focus rings are full `ring-ring` (not `/50`), buttons carry the hard shadow.

`shadcn-svelte Card.Content` ("vega" style) is `flex flex-col` by default — add `flex-row` explicitly when needed.
