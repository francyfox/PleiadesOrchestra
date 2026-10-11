# apps/admin-api internals

See root `CLAUDE.md` for commands, architecture overview and lessons.

## Overview

Elysia app (`/api/*`, Swagger UI at `/api/docs`, `/health`). Owns admin accounts (better-auth, email+password, own SQLite — never in the orchestrator DB), the orchestrator client (`ADMIN_API_KEY` + `X-Admin-Id` = signed-in admin's id on every mutation), and the host probe (`/proc`, `/sys/class/drm` → `GET /api/system`).

Wire types are **TypeBox** (`modules/<name>/<name>.schema.ts`, shared bits in `modules/common/common.schema.ts`; account DTOs via `drizzle-typebox`). Zod is only for env. Every response is validated.

CSRF defence: `Origin` check on state-changing methods (`ADMIN_TRUSTED_ORIGINS`, both `localhost` and `127.0.0.1`). WS upgrade is a GET — CSRF guard doesn't see it; `/api/live` checks `Origin` itself.

Local dev: `bun --cwd apps/admin-api run dev` (port 3003). Copy `.env.example` to `.env`.

## Code layout

`src/index.ts` + `src/app.ts` (`createApp(deps: AdminApiDeps)`) + `src/app.types.ts` (`AdminApiDeps`/`RouteDeps`) + `src/modules/<name>/`:
`<name>.ts` (controller/main class), `<name>.service.ts`, `<name>.schema.ts` (TypeBox DTOs), `<name>.test.ts`. Test helpers: `app.testing.ts` (`testApp()` with real in-memory DB + stub orchestrator) and `app.harness.testing.ts` (`useHarness()` + `setRespond()` to script the fake orchestrator).

`apps/admin` imports only two paths: `admin-api` (the `App` type from `src/app.ts`) and `admin-api/types` (`src/types.ts`, re-exports from modules) — keep both paths stable.

Modules: `admin-policy`, `admins`, `agents`, `auth`, `blocked-ips`, `channels`, `common`, `config`, `dashboard`, `database`, `live`, `live-hub`, `live-topics`, `mcp`, `orchestrator`, `origin-guard`, `performance`, `plan-runs`, `requests`, `session`, `stats`, `system`, `system-feed`, `usage`, `users`.

## Accounts and super admin

**Super admin** = earliest-created account (`superAdminId` in `modules/admins/admins.service.ts`, remembered by `createAdminDirectory`). `isSuper` in `/api/session` and `/api/admins`. Only the super can delete admins (`DELETE /api/admins/:id`; codes `not_super`, `self`); nobody can ban the super or change their password (`super_protected`).

With no admin, `GET /api/session` says `setupRequired`; after the first `POST /api/auth/register` public sign-up is closed at the API level. Further admins created by an admin via `POST /api/admins`.

better-auth is wrapped, not mounted: explicit `POST /api/auth/login|register|logout` return error **codes** (`weak_credentials`, `registration_closed`, …), never UI text. Business rules in `modules/admin-policy/admin-policy.service.ts`: no self-ban, no banning the last active admin, min password 8.

Auth is a macro (`{ admin: true }` in a `.guard`), implemented in `onRequest` — see Elysia auth lesson in root CLAUDE.md.

## Live WebSocket (`/api/live`)

One multiplexed WebSocket per tab. Browser sends `subscribe {id, topic, params}` / `unsubscribe`. Server-side hub (`modules/live-hub/live-hub.ts`, topics in `modules/live-topics/live-topics.ts`) keeps ONE poll timer per `topic+params` group while it has subscribers; sends a snapshot on subscribe and then only when the payload's hash changed.

Intervals: dashboard/users 5 s, user 3 s, channels/blocked-ips/admins/agents 10 s, performance 15 s. `upstream` error reported once per outage.

`GET /api/system/stream` — separate WebSocket for the header meter (session cookie at upgrade, its own `Origin` check). `createSystemSampler` parses `/proc/cpuinfo` once, reuses a snapshot younger than 1 s, shares one in-flight read; GPU sysfs files read in parallel. `SYSTEM_STREAM_INTERVAL_MS` default 5000; single timer runs only while ≥1 client subscribed.

Elysia gotcha: Elysia sends a `message` handler's **return value** to the client — never `return ws.send(...)`.

## Orchestrator proxy

`modules/orchestrator` — typed HTTP client with `ADMIN_API_KEY`, `X-Admin-Id` on every mutation. `OrchestratorError` → status mapping (404/502/503 `{ message }`). Uses `retryFetch` from `packages/elysia-kit`.

List endpoints take `page`/`pageSize` (no `pageSize` = all rows, used by selects). `GET /api/agents` proxies the orchestrator's agent list with a live `/health` probe.

## Requests BFF (`modules/requests`)

`buildRequestView` (pure, `requests.view.ts`) turns a chain of `plan_runs` into `RequestView` — nodes `prompt → translate → understand → steps → result` with status, per-step time, tool args, tool answers, effects, model calls. Browser tool step time = `browserMs` (pause→resume across two runs).

`GET /api/requests[/:id]` merges DB + `ActiveRuns` registry. Accepts `?status=&intent=&page=` (server-side filter — status is computed from the live registry + clock, not a column). A finished request's `now` is fixed so the hub doesn't re-push it.

Live topics: `requests` (3 s) / `request` (1 s).

## System probe

`GET /api/system` — parses `/proc/cpuinfo`, `/proc/stat` (CPU), `/proc/meminfo` (RAM), `/sys/class/drm/card*/device/*` (GPU VRAM/GTT/load). All host values (Docker doesn't namespace `/proc`/`/sys`). `GET /api/system/stream` keeps it live.

`GET /api/performance` — proxies the orchestrator's performance endpoint. `/recommendations` audit runs client-side on the cached snapshot.

## DB gotchas

Relative DB path in `env_file` moves DB off the volume — see root CLAUDE.md. `apps/admin-api/.env` must NOT set `ADMIN_DATABASE_PATH` or `ADMIN_MIGRATIONS_DIR`; compose pins both to `/data/...`. `ADMIN_MIGRATIONS_DIR=./drizzle` inside container resolves to nowhere and crashes on start (`Can't find meta/_journal.json`).

`ADMIN_TRUSTED_ORIGINS` must list both `http://localhost:3002` and `http://127.0.0.1:3002` — they're different origins.
