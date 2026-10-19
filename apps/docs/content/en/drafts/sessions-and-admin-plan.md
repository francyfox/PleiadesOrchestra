---
title: Sessions and admin panel plan
---

> **Update (2026-09-26):** the server side of `apps/admin` (better-auth, the administrators' database, the orchestrator client, reading `/proc`) moved to `apps/admin-api` (Elysia, Swagger at `/api/docs`). `apps/admin` is now a static SPA with no server code: the parts below about SvelteKit hooks, `+page.server.ts`, `svelte-adapter-bun` and the BFF describe the earlier design.

# Plan: users, whitelist and blocks, token accounting, shop web channels, an admin panel with GOAP visualisation

## Context and goal

Today:

- dialogue history is the in-memory `ThreadHistory` (`packages/core/src/history.ts`), the last 10 messages per thread, lost when `alpha-orchestrator` restarts;
- a whitelist exists only in `apps/telegram-bot`: the `ALLOWED_TELEGRAM_USER_IDS` env, checked in `handlers/message.ts` and `handlers/start.ts`; the bot silently ignores strangers. To add a person you edit the env and restart the bot. There are no blocks;
- `userId` arrives in `POST /v1/messages` but is not stored anywhere;
- tokens are visible only in stdout telemetry (`logLlmState`), and incompletely (see "Token accounting");
- what the GOAP planner did is invisible: `runPlan` returns only `executedActions: string[]`.

A new requirement for channels: Pleiades is also a chat bot for online shops, and **there may be many shops/sites**. A shop has anonymous visitors, and a site may have no sessions of its own, so the orchestrator must issue visitor ids itself.

Goals:

1. Users in SQLite (`drizzle-orm` + `bun:sqlite`), keeping **only the last 10 messages** of each.
2. Whitelist and blocks in the DB, managed from the admin panel. For a blocked or not-allowed user **the API simply stops answering**.
3. Token usage accounting per user. **Quotas are not in this plan.**
4. Web channels for many sites with anonymous visitors.
5. The `apps/admin` panel: SvelteKit (Svelte 5) + shadcn-svelte + TanStack Table: users, usage, blocking, whitelist, recent messages, GOAP run visualisation.

Not a goal: turingdb (`apps/memory`), quotas, the JS widget itself for the shop's site (the UI in the shopper's browser is a separate plan; this one is only the server side).

## Key decisions

### Only `alpha-orchestrator` owns the database

One process opens the SQLite file. The admin panel goes over HTTP (`/v1/admin/*`), `telegram-bot` over HTTP as now. Sharing the file between containers is a hidden coupling that bypasses the HTTP design, and SQLite has a single writer.

### Ports in `packages/core`, adapters in the orchestrator

- `HistoryStore` (async `get`/`append`/`reset`) instead of `ThreadHistory`; the in-memory implementation stays for tests.
- `UsageRecorder`, called on **every** model call.
- `PlanTracer`, an optional `runPlan` callback.

The Drizzle schema and implementations are in `apps/alpha-orchestrator/src/modules/database/`. `Agent.resetThread` → `Promise<void>`; the HTTP contract of `/v1/threads/:id/reset` does not change.

### The access check moves from `telegram-bot` to the orchestrator

For the admin panel to show a user who is not on the whitelist yet, and add them with a button, the orchestrator must learn about everyone who writes. So:

- `telegram-bot` no longer checks `ALLOWED_TELEGRAM_USER_IDS` itself. On every message and `/start` it first calls `POST /v1/access` (`{ channel, externalUserId, displayName }`): the orchestrator registers the user if they are not there yet, updates `lastSeenAt`/`displayName` and answers `{ allowed: boolean }`. On `allowed: false` the bot silently does nothing, exactly as now, **before** showing the "thinking…" status message.
- `/v1/messages` checks access again and on refusal answers `403` with no body; the model is not called (protection in case a client skips `/v1/access`).
- The message text of not-allowed users is not stored, only the user.
- The `ALLOWED_TELEGRAM_USER_IDS` env and both handler checks are removed after the move (a one-off script imports the current ids into the DB, see the phases); we do not keep confirmed-dead code.

"Stops answering" means "silently does not answer the user", not a hanging HTTP connection: hanging requests would hold resources on already limited hardware.

## Data model

### Roles: user and administrator

There are exactly two roles in the system, and they do not overlap:

- **User**: someone who uses the chat, through Telegram or a widget on a shop's site. Never enters the admin panel. Either *identified* (the channel's id is known: a Telegram id or a shop account id) or *anonymous* (a site visitor without an account; the orchestrator issues the id). Anonymous is not a separate role, just the same user without an external id.
- **Administrator**: someone who enters the admin panel: looks at users and usage, blocks, keeps the whitelist, configures channels. Does not work through the chat and is not stored in `users`.

So the roles live in different places:

- chat users are the `users` table in the orchestrator's DB (they come through channels);
- administrators are **better-auth accounts in `apps/admin`**, in the admin panel's own SQLite database (see "Administrator authentication"). The orchestrator knows nothing about administrator accounts: it only receives the id of the administrator who performed an action.

A user has no password, and an administrator has no channel, whitelist or messages, so there is no shared table with a `role` field.

### Channels

Every entry into the system is a channel: the Telegram bot, the CLI, every shop's site. There are many sites, and in the future there may be several bots, hence one table:

```ts
channels { id, slug (unique, e.g. "telegram", "cli", "shop-foo"), kind ("telegram" | "cli" | "web"),
           name, accessMode ("whitelist" | "open"),
           publishableKey?, secretKeyHash?, allowedOrigins? (json),   // web only
           disabledAt?, createdAt }
```

- `telegram` is `whitelist` (as now), `cli` is `open` (it is closed by `HARNESS_API_KEY` anyway), shop sites are usually `open`, but the mode is switched in the admin panel.
- Server-to-server clients (`telegram-bot`, `cli`, a shop's backend) pass `channel` (the slug) in the request body; the field is optional, with a default for `source` compatibility, so old clients do not break before they are updated.

### Users

```ts
users { id (uuid, ours), channelId → channels.id, externalUserId?, kind ("identified" | "anonymous"),
        displayName?, createdAt, lastSeenAt,
        whitelistedAt?, whitelistedBy?,          // administrator id from better-auth (no FK: another DB)
        blockedAt?, blockedReason?, blockedBy? }
  unique(channelId, externalUserId)
```

The access rule (one pure function, tested on its own):

1. channel disabled → no;
2. `blockedAt` → no (a block beats the whitelist);
3. `whitelist` channel → only with `whitelistedAt`;
4. otherwise → yes.

The access status is cached in process memory and invalidated by the admin endpoints. There is one process, so invalidation is trivial and the DB is not hit on every message.

### Messages: only the last 10 per user

```ts
threads  { id, userId → users.id, channelId, externalThreadId?, createdAt }
messages { id, threadId → threads.id, userId, role ("user" | "assistant"), content, createdAt, planRunId? }
  index(userId, createdAt), index(threadId, createdAt)
```

- On insert, in the same transaction, the user's messages older than the 10th are deleted (`DELETE ... WHERE userId = ? AND id NOT IN (the last 10)`). The limit is the `MESSAGE_RETENTION_PER_USER=10` env. It must be at least the agent's `maxHistoryMessages` (0 now), otherwise the model would lose context it had seen. This is checked at startup.
- **The model's context is only the current message** (`AGENT_MAX_HISTORY_MESSAGES = 0`, since 2026-09-28). The exchange is still saved in this table (admin panel, "Recent messages"), but it does not go into the model request: the 1B model copied its own template answers from the history (after 2–5 such pairs it answered "How can I help…?" to everything; checked directly on `llama-server`; repetition penalties and temperature did not help). To bring dialogue memory back, raise the constant in `apps/alpha-orchestrator/src/modules/agents/agents.instance.ts`.
- The limit counts **per user, not per thread** (decided). A consequence accepted on purpose: if a user has several threads (for example Telegram groups), talk in one pushes out the context of another. A test covers this so the behaviour is documented.
- `reset` deletes the thread's messages (as now, the behaviour does not change).
- GOAP traces are deleted with their messages (`ON DELETE CASCADE` by `planRunId`), so traces do not outlive the messages they belong to.
- **The token log is not deleted with them**: it contains no text and is needed for usage statistics over any period (see below).

**Privacy**: before, chat text was not stored anywhere. Now up to the last 10 messages of every user (including shop customers) are on disk. The DB file lives only in a named volume (`*.db*` in `.gitignore`/`.dockerignore`), and `/v1/admin/*` is behind a separate key.

## Token accounting

### What is wrong today

- In `packages/core/src/agent.ts` a long message is cut into chunks, and every chunk except the last gets a separate ingest `generateText` call. Its tokens go only to `logLlmState`, while `done` (and further `toEffects` of `generateReply`, and the `apps/cli` usage line) get **only the final generation's tokens**. Long messages are undercounted.
- `llama-server` may not return usage; then the tokens are `undefined`, which is not 0.

### Decision: a call log, aggregates by query

```ts
llm_calls { id, createdAt, userId?, channelId?, threadId?, planRunId?, actionName?,
            kind ("ingest" | "generate" | "decision"), provider, model,
            inputTokens?, outputTokens?, latencyMs, ok, error? }
  index(userId, createdAt), index(channelId, createdAt)
```

- The core's `UsageRecorder` is called next to every `telemetry.logLlmState`, ingest calls included, with the context (`threadId`, `userId`, `kind`) passed through `IncomingMessage`.
- Laya (`DecisionAgent`) is written as `kind = "decision"`: it has no tokens, but its latency is CPU spent on this hardware.
- `done` additionally gets `totalInputTokens`/`totalOutputTokens` for the message (the existing fields do not change: the `apps/cli` usage line depends on them).
- `null` tokens show as "no data" in the admin panel and are counted separately.
- Writing is one transaction per message after `done` is sent, so streaming is not delayed.
- `llm_calls` is not cleaned with the messages. It is one short row per model call, not much for SQLite. If it grows, old rows can be rolled up into daily aggregates as a separate task.
- If a user is deleted, their rows stay with `userId = null`, and the total usage for a period does not change.

## GOAP tracing and visualisation

### What to record

`RunPlanOptions` (`packages/core/src/goap/executor.ts`) gets an optional `tracer?: (event: PlanTraceEvent) => void`. It is a plain callback with no DB dependency:

```ts
type PlanTraceEvent =
  | { type: "planned"; attempt: number; plan: { name: string; cost: number }[]; totalCost: number; state: WorldState }
  | { type: "no_plan"; attempt: number; state: WorldState }
  | { type: "action_skipped"; attempt: number; action: string; unmetPreconditions: Partial<WorldState> }
  | { type: "action_started"; attempt: number; action: string; at: number }
  | { type: "action_finished"; attempt: number; action: string; durationMs: number;
      expectedEffects: Partial<WorldState>; observedEffects: Partial<WorldState> }
  | { type: "action_failed"; attempt: number; action: string; durationMs: number; error: string }
  | { type: "replan"; attempt: number; state: WorldState }
  | { type: "finished"; succeeded: boolean; attempts: number; durationMs: number };
```

```ts
plan_runs   { id, userId, threadId, goal (json), succeeded, attempts, durationMs, createdAt }
plan_events { runId → plan_runs.id (cascade), seq, type, attempt, action?, payload (json), at }
```

- Events are collected in memory per run and written in one transaction after it ends, not per action.
- Long strings in `state` are cut (~500 characters): the full text is in `messages` anyway.
- The trace is not added to the public NDJSON stream of `/v1/messages`.
- `llm_calls.planRunId`/`actionName` link token usage to a specific plan action. When a run is deleted they become `null`; the rows themselves stay.

### Visualisation in the admin panel

Every assistant reply links to its run page `/runs/[id]`:

1. **The plan graph** (`@xyflow/svelte`): nodes are the actions in plan order, one lane per attempt (a replan = a new lane), the last node is the goal. A node's colour is its status (done / skipped on preconditions / failed / not reached). A node shows its `cost`, duration and tokens.
2. **Timeline**: action bars over time.
3. **Expected vs observed effects**: a table with the differences highlighted. The differences explain the replanning.

`/goap/actions` is the action catalog as a "fact → action → fact" graph from `GET /v1/admin/goap/actions` (name, `cost`, `preconditions`, `effects`, without `execute`).

Turning trace events into graph nodes and edges is a pure function in `apps/admin`, covered by tests.

## Shop web channels (many sites, anonymous visitors)

### Visitor tokens

```ts
visitor_tokens { tokenHash (pk, sha256), userId → users.id, channelId, createdAt, lastUsedAt, expiresAt }
```

1. A widget without a token → `POST /v1/widget/visitors` (the channel's publishable key + an `Origin` from `allowedOrigins`) → the orchestrator creates an anonymous user and returns a random token (32 bytes). The DB stores only its hash.
2. The widget keeps the token on the shop's domain (cookie/`localStorage`). Its lifetime is **1 day** since the last activity (every request extends `expiresAt`).
3. A lost or expired token means a new anonymous user. That is a normal property of anonymity.

### Keeping anonymous users: one day

This applies only to anonymous chat users (site visitors without an account). Telegram users and identified shop visitors are not affected, administrators even less.

If an anonymous user has not written to the chat for more than 24 hours, these are deleted:

- their `users` row;
- their threads and messages;
- their visitor id (`visitor_tokens`); the widget gets a new one on the next visit;
- the GOAP traces of their replies (by cascade).

The LLM token usage log (`llm_calls`) is not deleted: its rows stay, only their user reference is cleared (`userId = null`), the channel is kept. So the admin panel's usage statistics by channel and by day do not change after the cleanup. Only the breakdown for that particular anonymous user disappears.

- The cleanup is a periodic task inside the orchestrator (`setInterval` once an hour, one `DELETE ... WHERE kind = 'anonymous' AND lastSeenAt < now - 24h` in a transaction) plus a run at startup. No separate cron service is needed: there is one process.
- The threshold is the `ANON_RETENTION_HOURS=24` env; the selection logic is a pure function with a test.
- Identified users (including former anonymous users after `identify`) are not cleaned up.
- Blocked anonymous users are deleted too: a block by token lives no longer than the token (1 day) anyway. Long-term protection against anonymous users is the block by IP hash, which has its own expiry.
- When merging with an existing user, the anonymous row is deleted at once; no need to wait a day.

### Linking to a shop account

The shop's backend (not the browser), when the shopper logs in: `POST /v1/channels/:slug/identify` with the channel's secret key and the body `{ visitorToken, externalUserId }`. The anonymous user becomes identified, or, if such an identified user already exists, is merged into them: messages (trimmed again to 10), `llm_calls` rows and the visitor's tokens move over, and the anonymous row is deleted. The `blockedAt`/`whitelistedAt` flags are merged in favour of the stricter one: a block on either of the two rows is kept.

If the shop has no accounts of its own, the step is not used. If the shop has its own cart or session id, its backend can send that as `externalUserId` through a server-to-server channel, and then visitor tokens are not needed.

### Protecting the public channel

No quotas, but open anonymous access to a CPU-only model still needs basic protection: CORS/`Origin` by `allowedOrigins`, a rate limit per token and per IP (in memory), a text length limit, a limit on visitor tokens issued to one IP. The IP is stored only as a salted hash, for the rate limit and blocking. Blocking an anonymous visitor by token is weak (clear the cookies and they are new), so web channels have blocking by IP hash (`blocked_ips { ipHash, channelId?, reason, createdAt, expiresAt }`), always with an expiry: IPs are often shared.

### Endpoints

| Method | Path | Auth | What |
|---|---|---|---|
| POST | `/v1/widget/visitors` | publishable key + Origin | issue a visitor token |
| POST | `/v1/widget/threads` | + visitor token | new conversation |
| POST | `/v1/widget/messages` | + visitor token | like `/v1/messages`, NDJSON; only into own threads |
| GET | `/v1/widget/threads/:id/messages` | + visitor token | recent messages of an own thread |
| POST | `/v1/channels/:slug/identify` | the channel's secret key | link a visitor to a shop account |

A visitor reads and writes **only their own threads**: checked by `threads.userId`, not by the id in the request.

## Admin API in `alpha-orchestrator`

A separate secret, `ADMIN_API_KEY`. Checked in the same `onRequest` hook by the `/v1/admin` prefix (see Lessons learned about the order of Elysia hooks).

| Method | Path | What |
|---|---|---|
| GET | `/v1/admin/users?channel&kind&status&q&sort&cursor&limit` | users: channel, status (allowed / waiting for the whitelist / blocked), `lastSeenAt`, tokens for a period |
| GET | `/v1/admin/users/:id` | the user card: status, usage by day, recent messages |
| POST | `/v1/admin/users/:id/whitelist` · `unwhitelist` | whitelist |
| POST | `/v1/admin/users/:id/block` · `unblock` | block with a reason |
| DELETE | `/v1/admin/users/:id/messages` | erase the user's messages |
| GET | `/v1/admin/usage?groupBy=day\|user\|channel\|model&from&to` | aggregates from `llm_calls` |
| GET | `/v1/admin/runs/:id` | a GOAP run + events |
| GET | `/v1/admin/goap/actions` | the action catalog |
| CRUD | `/v1/admin/channels` | channels/sites: access mode, keys (rotation), domains, disabling |
| CRUD | `/v1/admin/blocked-ips` | IP blocks |

The user list comes with server-side sorting, filters and cursor pagination: with many sites with anonymous visitors there will be many users, and the browser cannot hold them all. Tests go through `app.handle(request)` with `new Database(":memory:")` and the same migrations.

## Migrations and deployment

- `drizzle-kit generate` → SQL in `apps/alpha-orchestrator/drizzle/` (committed); `migrate()` from `drizzle-orm/bun-sqlite/migrator` at startup before `.listen()`.
- **The `--compile` risk**: the migrator reads a folder from disk, which is not embedded in the standalone binary. Copy `drizzle/` into the final image, with the path through an env (`DATABASE_MIGRATIONS_DIR`). Verify by building the image.
- The first migration creates the `telegram` (`whitelist`) and `cli` (`open`) channels.
- Env through `buildConfig`: `DATABASE_PATH`, `ADMIN_API_KEY`, `MESSAGE_RETENTION_PER_USER`, `IP_HASH_SALT`, `ANON_RETENTION_HOURS`.
- `compose.yml`: volume `alpha-orchestrator-data:/data`. For widgets, `/v1/widget/*` must be reachable from the internet (a tunnel, like the bot's webhook); `/v1/admin/*` is not published.

## `apps/admin`: SvelteKit + shadcn-svelte + TanStack Table

### Stack

- SvelteKit 2 + Svelte 5 (runes), TypeScript.
- UI: `shadcn-svelte` (Tailwind v4, `bits-ui`): `sidebar`, `table`, `card`, `badge`, `dialog`, `dropdown-menu`, `tabs`, `chart` (LayerChart, usage charts), `sonner`.
- **All tables are TanStack Table**: `@tanstack/svelte-table` v9 (stable, peer `svelte ^5`). The markup is shadcn-svelte's `table` component. shadcn-svelte's "Data Table" guide is written for v8 (`@tanstack/table-core` + its own `createSvelteTable` helper). With v9 we take the official adapter and check against its API instead of copying the guide blindly. Lists with server-side pagination use `manualPagination`/`manualSorting`/`manualFiltering`: the table state is synced with the URL's query parameters, and `+page.server.ts` loads the data.
- A user's recent messages: `@humanspeak/svelte-virtual-chat`. There are at most 10 messages, so the virtualisation is more for the ready chat look; no history loading is needed. Content is rendered as text, not through Svelte's `@html` tag.
- The GOAP graph: `@xyflow/svelte`.
- Adapter: `svelte-adapter-bun`; the fallback is `@sveltejs/adapter-node` under `bun`.

### Architecture

- BFF: the orchestrator is reached only from server code (`+page.server.ts`, form actions for the block/whitelist buttons, `src/lib/server/orchestrator-client.ts`). `ADMIN_API_KEY` never reaches the browser. Its own client, not shared with `cli`/`telegram-bot`.
- Env: `@t3-oss/env-core` + `zod` by the CLAUDE.md rule.
- With every admin request the BFF passes the logged-in administrator's id (an `X-Admin-Id` header next to `ADMIN_API_KEY`); the orchestrator writes it to `whitelistedBy`/`blockedBy`. The admin panel fills in names for these ids from its own database.

### Administrator authentication: better-auth

better-auth lives **in `apps/admin`**, not in the orchestrator: administrator accounts are the admin panel's concern, and the orchestrator stays behind `ADMIN_API_KEY` and never faces the browser.

- **Storage**: the admin panel's own SQLite database (`ADMIN_DATABASE_PATH`, its own `admin-data` volume), `drizzle-orm/bun-sqlite` + `drizzleAdapter(db, { provider: "sqlite" })`. The better-auth tables (`user`, `session`, `account`, `verification`) are generated by `@better-auth/cli generate`, migrations by `drizzle-kit`, as in the orchestrator. This does not break the rule "the orchestrator owns the chat database": there is not a single chat table here.
- **Sign-in method**: only `emailAndPassword`, no OAuth providers.
- **Plugins**: `admin` (gives `createUser`, the list, ban/unban, password change: everything the `/admins` page needs) and `sveltekitCookies(getRequestEvent)` last in the list, so that calls from form actions set the cookie.
- **SvelteKit**: `svelteKitHandler({ event, resolve, auth, building })` in `hooks.server.ts`. It does not fill `event.locals.user`/`session` itself; we fill them by hand through `auth.api.getSession({ headers })`.
- **Env**: `BETTER_AUTH_SECRET`, `BETTER_AUTH_URL`, `ADMIN_DATABASE_PATH`, through `buildConfig`.

**First start and closing registration:**

1. `hooks.server.ts` knows on every request whether there is at least one administrator. If not, **every page redirects to `/register`** (email + password). After the first `true`, the "an administrator exists" flag is cached in memory: it never goes back to `false`, because deleting or banning the last administrator is forbidden.
2. The first successful registration creates an administrator and signs them in at once (better-auth `autoSignIn`).
3. As soon as an administrator exists, **public registration is closed**: `/register` redirects to `/login`, and better-auth's `/sign-up/email` endpoint itself is rejected by a hook (`hooks.before` + `createAuthMiddleware`: `ctx.path === "/sign-up/email"` and `user` has rows → `APIError("FORBIDDEN")`). It must be closed at the API level, not just the page, or anyone could register with a direct POST.
4. From then on only a logged-in administrator creates new administrators, from the `/admins` page: a form action calls `auth.api.createUser({ headers, body: { email, password, name, role: "admin" } })` from the admin plugin. That path bypasses `/sign-up/email`, so the registration hook does not block it, and `createUser` itself requires a session with the `admin` role.
5. Every account in this database is an administrator. `databaseHooks.user.create.before` forces `role: "admin"`, so no "user" without rights who can sign in ever appears. Chat users never get here.

A race between two simultaneous "first" registrations is theoretically possible: the check and the insert are not atomic. The admin panel listens only on `127.0.0.1`, so the risk is accepted. If needed, a second check in `databaseHooks.user.create.before` inside the same transaction.

Future, not in this plan: an invitation by referral link (a one-off token with a TTL that opens `/register` again for one person). A new `admin_invites` table; the rest of the schema does not change.

### Pages

- `/`: the dashboard: tokens for today / 7 / 30 days (a chart by day), top users and channels by usage, the share of calls without usage, how many users wait for the whitelist.
- `/users`: a **TanStack table**: name, channel, type (anon/identified), status, last activity, tokens for a period. Filters: channel, status, search. Sorting by usage/activity. Row and bulk actions (row selection): "whitelist", "remove from whitelist", "block" (a dialog with a reason), "unblock".
- `/users/[id]`: the status and the same buttons, a usage chart by day, a usage table by model and call type, the last 10 messages (`svelte-virtual-chat`) with links to GOAP runs, "erase messages".
- `/runs/[id]`: the plan graph, timeline, expected vs observed effects table.
- `/goap/actions`: the action catalog.
- `/channels`: a table of channels/sites: access mode, domains, disabling, key rotation (the secret key is shown once).
- `/blocked-ips`: the table of IP blocks.
- `/register`: registration of the first administrator (available only while there are no administrators).
- `/login`: sign in with email and password.
- `/admins`: the administrators table (TanStack): create a new one (email, name, temporary password), ban/unban, change password. The last active administrator cannot be banned.

### Fitting into the monorepo

- `apps/admin/package.json` with the standard scripts; in `turbo.json`, outputs `.svelte-kit/**`, `build/**`.
- **`COPY apps/admin/package.json ...` into every existing Dockerfile** with `--frozen-lockfile` (a lesson from CLAUDE.md).
- `apps/admin/Dockerfile`, a compose service `admin` on `127.0.0.1:3002`, `ADMIN_API_KEY` from the root `.env`, `BETTER_AUTH_SECRET` in `apps/admin/.env`, an `admin-data` volume for the better-auth database. The admin database's migrations run at startup, as in the orchestrator.
- Tests: `bun test` for the server logic: the `/register` ↔ `/login` redirect rule, the registration-closing hook, the orchestrator client, env transforms, the URL ↔ table state mapping, trace → graph.

### Friction to check first

- **TypeScript 7**: the root has `typescript ^7`, while the peer dependencies of `@sveltejs/kit`/`svelte-check` are `^5 || ^6` and `svelte-adapter-bun` is `^5`. `apps/admin` will probably need TS 6.
- **Biome and `.svelte`**: support is partial; check `bun run lint`, add `overrides` in `biome.json` if needed.
- **turbo `test`** must not pull in the admin panel's Vite build.

## Implementation phases (test-first, one PR-sized piece per phase)

1. **Ports in core**: `HistoryStore` (async), `UsageRecorder` on every model call (ingest included), total tokens in `done`.
2. **`runPlan` tracing**: `tracer`, events as listed above; tests for replanning, skipping on preconditions, an action failing.
3. **SQLite layer**: `channels`/`users`/`threads`/`messages`/`llm_calls`/`plan_runs`/`plan_events`, migrations, port implementations, trimming to 10 messages per user.
4. **Access**: the pure access-rule function, `POST /v1/access`, `403` in `/v1/messages`, the status cache. `channel`/`displayName` in requests from `telegram-bot` and `cli`.
5. **Moving the whitelist** (low priority: the Telegram bot is not the main channel now): a one-off script imports the current `ALLOWED_TELEGRAM_USER_IDS` into the DB, and `telegram-bot` switches to `/v1/access`. After that the env variable and the handler checks are removed.
6. **Docker/compose**: the volume, migrations in the image, a live check of the `--compile` binary (message → restart → history and usage still there; a not-allowed user is silently ignored).
7. **Admin API** (`/v1/admin/*`, `ADMIN_API_KEY`, `X-Admin-Id`).
8. **`apps/admin` skeleton**: SvelteKit + shadcn-svelte + TanStack Table + adapter, resolve the friction. better-auth: its own SQLite, `/register` → the first administrator, closing registration (test: a direct POST to `/sign-up/email` after the first administrator → 403), `/login`, `/admins`.
9. **Pages**: `/users` (table, filters, bulk actions), `/users/[id]`, the usage dashboard.
10. **GOAP visualisation**: `/runs/[id]`, `/goap/actions`.
11. **Web channels**: visitor tokens, `/v1/widget/*`, CORS/Origin, rate limit, `blocked_ips`, `identify` with merging, the daily cleanup of anonymous users; the `/channels` and `/blocked-ips` pages.
12. **CLAUDE.md**: `apps/admin`, the DB owner, access through the orchestrator, web channels, lessons.

Phases 1–10 cover Telegram + CLI + the admin panel. Phase 11 is for when the first shop is needed.

## Open questions

None. Decided along the way: the 10-message limit counts per user; anonymous users are kept for 1 day; the Telegram bot stays silent to a not-allowed user, `/start` included; administrators are created through better-auth, the first one by registering on the web.
