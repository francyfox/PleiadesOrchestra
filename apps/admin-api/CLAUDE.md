# apps/admin-api internals

See root `CLAUDE.md` for monorepo commands, workflow, code style and repo-wide lessons.

## Overview

Elysia app (`/api/*`, Scalar API reference at `/api/docs`, `/health`). Owns accounts (better-auth: staff by access token, customers by email+password, own SQLite — never in the orchestrator DB), the orchestrator client (`ADMIN_API_KEY` + `X-Admin-Id` = signed-in admin's id on every mutation), and the host probe (`/proc`, `/sys/class/drm` → `GET /api/system`).

Wire types are **TypeBox** (`modules/<name>/<name>.schema.ts`, shared bits in `modules/common/common.schema.ts`; account DTOs via `drizzle-typebox`). Zod is only for env. Every response is validated.

CSRF defence: `Origin` check on state-changing methods (`ADMIN_TRUSTED_ORIGINS`, both `localhost` and `127.0.0.1`). WS upgrade is a GET — CSRF guard doesn't see it; `/api/live` checks `Origin` itself.

Local dev: `bun --cwd apps/admin-api run dev` (port 3003). Copy `.env.example` to `.env`. No `build` script: the Docker image runs the same `bun build --compile` (copy `drizzle/` into the image — compile doesn't embed migrations); `bun install` at the root after renaming `apps/*`.

Migrations: after editing the schema, `bun --cwd apps/admin-api run auth:schema` (regenerates the better-auth schema), then `db:generate --name <name>`; applied at startup. Then `bunx biome format --write apps/admin-api/drizzle/meta` and `bun --cwd apps/admin-api run db:snapshot`.

## Code layout

Follows the root "Code style" convention. Specific here: `src/app.types.ts` (`AdminApiDeps`/`RouteDeps`) next to `src/app.ts` (`createApp(deps: AdminApiDeps)`). Test helpers: `app.testing.ts` (`testApp()` with real in-memory DB + stub orchestrator) and `app.harness.testing.ts` (`useHarness()` + `setRespond()` to script the fake orchestrator).

`apps/admin` imports only two paths: `admin-api` (the `App` type from `src/app.ts`) and `admin-api/types` (`src/types.ts`, re-exports from modules) — keep both paths stable.

Modules: `admin-policy`, `accounts`, `admins`, `agents`, `auth`, `billing`, `blocked-ips`, `channels`, `common`, `config`, `customers`, `dashboard`, `database`, `live`, `live-hub`, `live-topics`, `mail`, `mcp`, `orchestrator`, `origin-guard`, `performance`, `plan-runs`, `requests`, `sentry-tunnel`, `session`, `staff-token`, `stats`, `subscriptions`, `system`, `system-feed`, `usage`, `visitors`.

## Accounts, levels and sign-in

One better-auth `user` table, a number `user.level` (`modules/accounts/accounts.schema.ts`: `LEVEL.super` 0, `admin` 100, `user` 200; `isStaff(level)` = `<= 100`). Extra columns come from `accountFields` (shared by `auth.ts` and `auth-cli.ts`, so `bun run auth:schema` sees them): `level`, `lastActiveAt`, `tokenHash` (`returned: false`), `locale`. `level` is `input: false` — a sign-up body can never choose it; a user is always 200.

**Staff** (0/100) have no password. `modules/staff-token/` is a better-auth plugin whose endpoint checks a presented token against every staff `tokenHash` in constant time and creates a normal session; `POST /api/auth/token` (in `session.ts`) wraps it with the per-IP throttle. Create / rotate / edit live in `modules/admins/admins.service.ts` (`createStaff`, `rotateToken` — deletes all the admin's sessions, `editStaff`). The staff CLI is a subcommand of the server itself: `admin-api admin:create --email E [--name N] [--level 0|100]` (`src/index.ts` checks `argv[2]` before anything starts → `runAdminCreate` in `admins-cli.ts` → `createOrRotateStaff` in `admins-cli.service.ts`). It prints the token once; the first account is level 0; an existing staff email gets a fresh token. In production `albedo admin:create` (`apps/cli`) runs it in the container via `docker compose -p pleiades-orchestra exec -T admin-api ...`, with the container's env and `/data`; bare dev: `cd apps/admin-api && bun src/index.ts admin:create ...`. The migration `0001_accounts_levels` made every old account staff (earliest = super) and deleted their credential rows, so an existing install runs the CLI once per admin.

**Users** (200): `modules/accounts/accounts.ts` is `/api/user/*` (register, login, verify, forgot, reset, me). Registration needs mail verification (`requireEmailVerification`); a taken email looks like success (better-auth hides it); if that account is still unverified, `onExistingUserSignUp` mails it a fresh link. `POST /api/user/resend` sends the verification mail again (same `{ ok: true }` for unknown or verified emails). Every link mail (sign-up, sign-up again, sign-in of an unverified account, resend, forgot) goes through one `createMailCooldown` in `auth.ts`: one mail per address per minute (`MAIL_COOLDOWN_MS`, in memory); staff never get "confirm your email". `/api/user/login` refuses staff emails itself. Mail: `modules/mail/` — `buildMail` wraps `renderMail` from `@repo/mail-templates` (HTML + text; `email-change` kind picked when the token has `updateTo`); `createMailer(config)` over `nodemailer` sends both, logs subject+link without `SMTP_PASS`, logs each sent mail, reports a failed one (SMTP error or refused recipient) through `onError` = `logger.error` + Sentry `capture` (tag `feature: mail`); a bounce that arrives later lands only in the sender mailbox; tests use `createFakeMailer()` (`app.testing.ts` exposes it as `mailer`; `signedUser()` registers + verifies + signs in a customer). Links use `panelUrl` (`PUBLIC_PANEL_URL`, default `BETTER_AUTH_URL`).

**Guards** (`auth.service.ts`, `requireAdmin(auth)` gives both macros): `{ admin: true }` = staff (user → 403 `forbidden`, none → 401); `{ account: true }` = any signed-in account. Super-only checks compare `admin.level === 0` (`deleteRefusal`, `manageRefusal` in `admin-policy`). Both macros and `GET /api/session` go through `currentSession`, which sets `last_active_at` when it is unset or a day old (`needsTouch`). `index.ts` runs `deleteInactiveUsers` (`accounts.service.ts`, 180 days, level 200 only) at start and daily. Both it and the delete routes go through `deleteAccount(ctx, id, actorId)` in the same file: orchestrator channels first (`deleteOwnerChannels`), then the row; a failure keeps the account (logged, retried next run). Extend `deleteAccount` when users own more than an account row.

**Staff money**: `fetchDashboard` adds `finance` (orchestrator `GET /v1/admin/finance`) only when `ownerId` is undefined, i.e. the unscoped staff view; REST and the `dashboard` live topic share it.

**Ownership** (the only place that decides who sees what; the orchestrator trusts `ADMIN_API_KEY`): `modules/channels/channels.service.ts` has `ownerScope(account)` (user = own id, staff = `undefined`) and `mayAccessChannel` (a user's channel routes call it first and answer 404 `not_found`). Channel routes and `/dashboard` are `{ account: true }` and scope by `ownerScope`; a client `ownerId` is used only for staff. Visitors, requests (Flow) and blocked IPs are `{ account: true }` too: lists pass `ownerScope`; a user's visitor/request detail passes `ownerId` upstream (orchestrator 404s a foreign one); visitor mutations call `assertVisitorAccess` first, bulk sends `ownerId`; a user's IP block needs their own `channelId` (staff may block globally), delete checks `mayDeleteBlock`. `/api/live` is `{ account: true }` too: `live.service.ts` `scopeSubscription` lets a user watch only `USER_TOPICS` (dashboard, channels, visitors, visitor, requests, request, blocked-ips) and overwrites `params.ownerId` with the session's id (other topics: error `forbidden`); staff pass through. `modules/customers/` is the staff "Users" page (`/api/accounts`: list with `channelsCount`, delete, ban/unban, level 200 targets only). Own settings (`PATCH /api/user/me`, `POST /api/user/me/email` through better-auth `changeEmail`, `DELETE /api/user/me`) live in `accounts.ts` and refuse staff. Elysia validates the body before the macro guard, so `levels.test.ts` (walks `app.routes` with a user session) accepts 403 or 422. Test helper `fakeOrchestrator(respond?)` in `app.testing.ts` records upstream calls (method, path, `X-Admin-Id`, body).

Wrapped, not mounted: better-auth is called through `auth.api`; routes return error **codes** (`weak_credentials`, `invalid_token`, …), never UI text. Business rules in `modules/admin-policy/admin-policy.service.ts`: no self-ban, no banning the last active admin or a super admin, min password 12 (users).

## Billing (`modules/billing`)

User-only routes under `/api/billing` (staff get 403): own billing and `standing` (orchestrator `GET /v1/admin/accounts/:id/billing`, one call cached 5 s), Polar checkout and customer portal. `billing.service.ts` has `createPolarClient` (plain `fetch`, no SDK; `POLAR_SERVER` sandbox|production, `POLAR_ACCESS_TOKEN`, `POLAR_PLAN_PRODUCT_ID`, `POLAR_CREDITS_PRODUCT_ID`; no token = `polar` unset = 503 `billing_unavailable`), the pure `warnings`/`standingView` (warn = balance < 1 TR or plan end within 3 days) and `sendDueNotices` (mails once per account/kind/period through `account_notices`, a unique row claimed before sending; mail kinds `low-balance`, `plan-ending`). `PolarError` becomes 502 `billing_failed` through `polarErrors`. `deleteAccount` revokes a running Polar plan first (needs `polar` in its context); a Polar failure keeps the account. Drizzle tables outside better-auth's live in `database.notices-schema.ts` (also in `drizzle.config.ts`). Contract: `apps/docs/content/en/drafts/admin-api.md` ("Billing").

## Sentry tunnel (`modules/sentry-tunnel`)

`POST /api/monitoring/tunnel` — the panel's Sentry SDK (`tunnel` option) posts envelopes here, because ad blockers drop `*.ingest.sentry.io`. No session (sign-in pages report too), origin guard applies. `tunnelTarget` forwards only envelopes whose header `dsn` is `SENTRY_TUNNEL_DSN` (host, key and project must match — never an open proxy); unset = 404, other DSN = 403, over 10 MB = 413. Body read raw (`parse: "none"`: feedback screenshots are binary items) and sent with the client IP in `X-Forwarded-For`.

## Live WebSocket (`/api/live`)

One multiplexed WebSocket per tab. Browser sends `subscribe {id, topic, params}` / `unsubscribe`. Server-side hub (`modules/live-hub/live-hub.ts`, topics in `modules/live-topics/live-topics.ts`) keeps ONE poll timer per `topic+params` group while it has subscribers; sends a snapshot on subscribe and then only when the payload's hash changed.

Intervals: dashboard/visitors 5 s, visitor 3 s, channels/blocked-ips/admins/agents 10 s, performance 15 s. `upstream` error reported once per outage.

`GET /api/system/stream` — separate WebSocket for the header meter (session cookie at upgrade, its own `Origin` check). `createSystemSampler` parses `/proc/cpuinfo` once, reuses a snapshot younger than 1 s, shares one in-flight read; GPU sysfs files read in parallel. `SYSTEM_STREAM_INTERVAL_MS` default 15000; single timer runs only while ≥1 client subscribed.

Elysia gotcha: Elysia sends a `message` handler's **return value** to the client — never `return ws.send(...)`.

## Orchestrator proxy

`modules/orchestrator` — typed HTTP client with `ADMIN_API_KEY`, `X-Admin-Id` on every mutation. `OrchestratorError` → status mapping (404/502/503 `{ message }`). Uses `retryFetch` from `packages/elysia-kit`.

List endpoints take `page`/`pageSize` (no `pageSize` = all rows, used by selects). `GET /api/agents` proxies the orchestrator's agent list with a live `/health` probe.

## Requests BFF (`modules/requests`)

`buildRequestView` (pure, `requests.view.ts`) turns a chain of `plan_runs` into `RequestView` — nodes `prompt → translate → understand → steps → result` with status, per-step time, tool args, tool answers, effects, model calls. Browser tool step time = `browserMs` (pause→resume across two runs).

`GET /api/requests[/:id]` merges DB + `ActiveRuns` registry. Accepts `?status=&intent=&page=` (server-side filter — status is computed from the live registry + clock, not a column). A finished request's `now` is fixed so the hub doesn't re-push it.

Live topics: `requests` (3 s) / `request` (1 s).

`GET /api/requests/:id/trace` (`requests.trace.ts`, `buildWebMcpTrace`): the request as a Model Context Tool Inspector export (`userPrompt`/`response` array, tools `_0_<name>`, `config` on every userPrompt with `systemInstruction: []`). Browser answers come from the next run's first `state` (`webmcp:<tool>:text`, capped at 4000 chars); tools from `GET /v1/admin/mcp` for the `channelId` in the world state. Loose `t.Array(t.Unknown())` response schema on purpose.

## System probe

`GET /api/system` — parses `/proc/cpuinfo`, `/proc/stat` (CPU), `/proc/meminfo` (RAM), `/sys/class/drm/card*/device/*` (GPU VRAM/GTT/load). All host values (Docker doesn't namespace `/proc`/`/sys`, so no extra mounts or privileged sidecar are needed). `GET /api/system/stream` keeps it live.

`GET /api/performance` — proxies the orchestrator's performance endpoint. `/recommendations` audit runs client-side on the cached snapshot.

## DB gotchas

Relative DB path in `env_file` moves DB off the volume — see root CLAUDE.md. `apps/admin-api/.env` must NOT set `ADMIN_DATABASE_PATH` or `ADMIN_MIGRATIONS_DIR`; compose pins both to `/data/...`. `ADMIN_MIGRATIONS_DIR=./drizzle` inside container resolves to nowhere and crashes on start (`Can't find meta/_journal.json`).

`ADMIN_TRUSTED_ORIGINS` must list both `http://localhost:3002` and `http://127.0.0.1:3002` — they're different origins (CSRF: `localhost` != `127.0.0.1`; same for `BETTER_AUTH_URL`).

## `drizzle/init.sql` (first-time setup)

One generated SQL file with the full schema, seed data and the `__drizzle_migrations` rows (so the migrator sees all existing migrations as applied). After every `db:generate`, run `bun run db:snapshot` (`scripts/db-snapshot.ts` → `src/modules/database/database.snapshot.ts`, which runs the real migrator in a temp DB and dumps it). `database.snapshot.test.ts` fails if the committed file is stale. Services keep applying incremental migrations at startup; init.sql is only for provisioning a fresh DB (`sqlite3 db < drizzle/init.sql`).
