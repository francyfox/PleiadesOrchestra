---
title: Admin API contract
---

# HTTP contract of `alpha-orchestrator` for the admin panel and transports

The source of truth for developing `apps/alpha-orchestrator` (the server), `apps/admin-api` (a client; also the panel's BFF) and `apps/telegram-bot`/`apps/cli` (clients) in parallel. Design and motivation: [Sessions and admin panel plan](/docs/drafts/sessions-and-admin-plan/). Change the contract, change this page in the same PR.

The `apps/admin` panel does not call this API directly: it is a static SPA that talks to `apps/admin-api` (`/api/*`, Elysia, Swagger UI at `/api/docs`), which calls this API with the `ADMIN_API_KEY` and an `X-Admin-Id` from the administrator's session. The panel ↔ `admin-api` contract is described by TypeBox schemas in `apps/admin-api/src/schemas/` and documented by Swagger; the DTOs below are the same as there.

General rules:

- All times are epoch ms (`number`).
- JSON, `content-type: application/json`, except the NDJSON stream of `/v1/messages`.
- An error is any non-2xx; the body is not part of the contract (clients check `!response.ok`).
- Identifiers are strings.

## Transport API (`Authorization: Bearer <HARNESS_API_KEY>`)

### `POST /v1/access`

Registers a channel user (if not there yet), updates `lastSeenAt`/`displayName`, and answers whether they are allowed. The message text is not sent here.

```json
// request
{ "channel": "telegram", "externalUserId": "123456", "displayName": "Ivan" }
// response 200
{ "allowed": true, "userId": "<our uuid>" }
```

`channel` is the slug of an existing channel; an unknown slug → `404`. `displayName` is optional.

### `POST /v1/messages` (changed)

```json
{ "threadId": "t1", "userId": "<externalUserId>", "text": "...", "channel": "telegram", "displayName": "Ivan" }
```

- `channel` is optional, `"cli"` by default. `displayName` is optional.
- `userId` in the body is the user's **external** id in the channel (as before).
- A user who is not allowed (channel disabled / user blocked / not on the whitelist of a channel with `accessMode = "whitelist"`) → `403` with an empty body; the model is not called.
- An unknown `channel` → `404`.
- The NDJSON events are as before; `done` gained optional `totalInputTokens`/`totalOutputTokens`.

`POST /v1/threads/:id/reset`: the contract is as before (`204`), with a new optional query `?channel=<slug>`. Threads are now stored per user, so one external id may match several internal threads; without `?channel=` all matches are reset. An unknown id is also `204` (nothing to reset).

`POST /v1/decisions` does not change.

## Admin API (`Authorization: Bearer <ADMIN_API_KEY>`)

Everything is under `/v1/admin/*`. Mutating requests (POST/PATCH/DELETE) must send `X-Admin-Id: <administrator id from better-auth>`, without it → `400`. The `HARNESS_API_KEY` gives no access to `/v1/admin/*` (→ `401`), and vice versa.

### Types

```ts
type UserStatus = "allowed" | "pending" | "blocked";
// blocked  — blockedAt != null (strongest)
// pending  — the channel is in "whitelist" mode and whitelistedAt == null
// allowed  — otherwise
// A disabled channel does not affect the user's status (visible in channel.disabledAt).

interface ChannelRef { id: string; slug: string; name: string; kind: "telegram" | "cli" | "web" }

interface UsageTotals {
  inputTokens: number;        // sum over calls where the provider reported usage
  outputTokens: number;
  calls: number;
  callsWithoutUsage: number;  // calls without usage, not included in the sums above
}

interface AdminUser {
  id: string;
  channel: ChannelRef;
  kind: "identified" | "anonymous";
  externalUserId: string | null;
  displayName: string | null;
  status: UserStatus;
  whitelistedAt: number | null;
  whitelistedBy: string | null;   // administrator id
  blockedAt: number | null;
  blockedReason: string | null;
  blockedBy: string | null;
  createdAt: number;
  lastSeenAt: number;
  ip: string | null;              // IP of the last widget request, in clear text; null = unknown (Telegram/CLI, old rows)
  usage: UsageTotals;             // for the request's from/to period, all time by default
}

interface AdminMessage {
  id: string;
  threadId: string;
  role: "user" | "assistant";
  content: string;
  createdAt: number;
  planRunId: string | null;
  usage: { inputTokens: number | null; outputTokens: number | null; latencyMs: number } | null; // assistant only
  // usage = the sum of all model calls of this reply's GOAP run (ingest + generation).
  // inputTokens/outputTokens = null if any call did not report usage (a partial sum would understate).
  // usage = null if the reply has no run or the run has no calls.
}

interface Channel extends ChannelRef {
  accessMode: "whitelist" | "open";
  allowedOrigins: string[];
  catalogLanguage: string;       // language of the product names on the site, a code like `en`/`ru`/`pt-BR` (`en` by default)
  publishableKey: string | null;
  disabledAt: number | null;
  createdAt: number;
}
```

### Users

`GET /v1/admin/users`

Query: `channel` (slug), `kind`, `status`, `q` (search by displayName/externalUserId), `sort` = `lastSeenAt` | `createdAt` | `tokens` (`lastSeenAt` by default), `order` = `asc` | `desc` (`desc` by default), `from`/`to` (the period for `usage`), `cursor`, `limit` (1–200, 50 by default).

```json
{ "items": [AdminUser], "nextCursor": "opaque" | null, "total": 123 }
```

An invalid query (an unknown enum value and so on) → `422`.

`cursor` is an opaque string; the client passes it back as is. `total` is the number of users matching the filters.

`GET /v1/admin/users/:id` →

```json
{
  "user": AdminUser,
  "messages": [AdminMessage],          // the last ≤10, oldest to newest
  "usageByDay": [{ "day": "2026-09-24", "inputTokens": 0, "outputTokens": 0, "calls": 0, "callsWithoutUsage": 0 }],
  "usageByModel": [{ "model": "vikhr-llama-3.2-1b", "kind": "generate", "inputTokens": 0, "outputTokens": 0, "calls": 0, "callsWithoutUsage": 0, "avgLatencyMs": 0 }]
}
```

`usageByDay` covers the last 30 days (UTC); days without calls are omitted.

| Method | Path | Body | Response |
|---|---|---|---|
| POST | `/v1/admin/users/:id/whitelist` | — | `{ "user": AdminUser }` |
| POST | `/v1/admin/users/:id/unwhitelist` | — | `{ "user": AdminUser }` |
| POST | `/v1/admin/users/:id/block` | `{ "reason": "..." }` (optional) | `{ "user": AdminUser }` |
| POST | `/v1/admin/users/:id/unblock` | — | `{ "user": AdminUser }` |
| POST | `/v1/admin/users/bulk` | `{ "ids": [..], "action": "whitelist"\|"unwhitelist"\|"block"\|"unblock", "reason"?: "..." }` | `{ "updated": 3 }` |
| DELETE | `/v1/admin/users/:id/messages` | — | `204` |

An unknown `:id` → `404`.

### Usage

`GET /v1/admin/usage?groupBy=day|user|channel|model&from&to&channel`

```json
{ "rows": [{ "key": "2026-09-24", "label": "2026-09-24", "inputTokens": 0, "outputTokens": 0, "calls": 0, "callsWithoutUsage": 0, "avgLatencyMs": 0,
  "costUsd": 0.0123, "price": { "inputPerMillion": 0.09, "outputPerMillion": 0.3 } }] }
```

`costUsd` = tokens × the model's price, summed per row; `null` when the prices could not be fetched (`GET https://openrouter.ai/api/v1/models`, per-token `pricing.prompt`/`completion`, cached a day in memory, a failure is retried after 5 minutes and keeps the previous list). A model with no price (a local one, or unknown to OpenRouter) costs 0. `price` (USD per 1M tokens, `null` = no price) is present on `groupBy=model` rows only. Shortcut: today's price is applied to past tokens.

`key` is a day (`YYYY-MM-DD`, UTC) / user id / channel slug / model. `label` is human-readable (for a user, the displayName or externalUserId; for deleted anonymous users `"(удалён)"` ("deleted") with key `null`). By default `from` = 30 days ago, `to` = now.

`GET /v1/admin/stats` →

```json
{ "users": { "total": 0, "pending": 0, "blocked": 0, "anonymous": 0 },
  "usage": { "today": UsageTotals, "last7d": UsageTotals, "last30d": UsageTotals } }
```

### Subscriptions (Polar, the "Cloud" plan)

Filled by `POST /v1/billing/polar` (below). `status` is derived: `ended` (Polar `canceled`/`incomplete_expired`, or `ended_at` set), `past_due` (also `unpaid`, `incomplete`), `canceling` (active with `cancel_at_period_end`), `active` (also `trialing`).

| Method | Path | Body | Response |
|---|---|---|---|
| GET | `/v1/admin/subscriptions?status=active\|canceling\|past_due\|ended` | — | `{ "items": [Subscription] }` — plans expiring within 7 days first, then by `currentPeriodEnd`, ended last |
| PUT | `/v1/admin/subscriptions/:id/channel` | `{ "channelId": string \| null }` | `Subscription`; `404` unknown subscription, `400` unknown channel; `null` unlinks |

```ts
interface Subscription {
  id: string;                       // Polar subscription id
  customerId: string; customerEmail: string | null;
  plan: string | null;              // Polar product name
  status: "active" | "canceling" | "past_due" | "ended";
  startedAt: number | null;
  currentPeriodEnd: number | null;  // the expiry date
  endedAt: number | null;
  channelId: string | null; channelName: string | null;  // set by hand
  polarUrl: string | null;          // POLAR_DASHBOARD_URL + "/" + id; null when unset
}
```

Nothing is blocked when a plan ends: the panel shows it (Plans tab, a plan column on the channels page).

### Performance

`GET /v1/admin/performance?from&to` (the last 30 days by default): model call latencies from the `llm_calls` log.

```json
{
  "rows":    [{ "day": "2026-09-24", "kind": "generate", "calls": 3, "failed": 1, "p50": 4000, "p90": 9000, "p99": 9000, "max": 9000, "tokensPerSecond": 37.5 }],
  "overall": [{ "kind": "generate", "calls": 3, "failed": 1, "p50": 4000, "p90": 9000, "p99": 9000, "max": 9000, "tokensPerSecond": 37.5 }]
}
```

- `rows` are per day (UTC) × `kind` (`ingest` / `generate` / `decision` / `translate`; `translate` is not an LLM but the CTranslate2 message translator, `provider: ctranslate2`, `action_name: translate`, no tokens; `classify` is the message intent decision, `action_name: classify`, `provider` = `laya` / `memory` / `rules`, whichever decided). `overall` is per `kind` over the whole period.
- Percentiles are nearest-rank over the `latencyMs` of all calls, including failed ones (`failed` is their count).
- `tokensPerSecond` is the median of `outputTokens / latency` over successful calls with usage; `null` if there are none (Laya has no tokens).

### GOAP

### Requests (chains of runs)

One user message = one **request**: the first run plus one more per browser tool answer (a run stops on `waiting` and is resumed by a new one). The runs of one request are linked by `plan_runs.root_run_id` (the root is the first run itself; `NULL` on old rows reads as "its own root"). The chain's traces live as long as at least one reply in `messages` does (see `trimUserHistory`).

`GET /v1/admin/requests?page=&pageSize=&status=&intent=` (newest first; 25 without `pageSize`; `status` is one of the values below, `intent` is an exact match on the row's `intent`; with a filter, `total` is the number of matching requests; the status is not a DB column, so with a filter the orchestrator builds the summaries of all requests and cuts the page afterwards) →

```json
{ "items": [{ "id": "<id of the first run>", "userId": "", "threadId": "", "prompt": "купи 1 сыр",
              "intent": "addToCart", "status": "running" | "waiting" | "succeeded" | "failed" | "abandoned",
              "steps": ["choose_store", "search_products"], "runs": 2, "startedAt": 0, "durationMs": 0 }],
  "total": 1 }
```

`status`: `running` means a run is going on now (the `ActiveRuns` registry in the orchestrator's memory); `waiting` means the last run stopped on a browser tool that has not answered yet (< 5 min); `abandoned` means it has not answered for more than 5 minutes; otherwise `succeeded`/`failed` by the last run. `steps` are the actions in order of completion plus the one the browser is running now. `durationMs` of a running request counts up to "now". `prompt` is cut to 200 characters; for requests recorded before the column existed, it comes from the first plan's `userMessage`.

`GET /v1/admin/requests/:id` (the id of any run in the chain works; unknown → `404`) →

```json
{
  "request": { "id": "", "userId": "", "threadId": "", "prompt": "", "intent": "addToCart", "status": "succeeded",
               "goal": {}, "reply": "the assistant's reply or null", "startedAt": 0, "durationMs": 0 },
  "runs": [{ "id": "", "createdAt": 0, "durationMs": 0, "succeeded": true, "running": false,
             "events": [{ "seq": 0, "type": "planned", "attempt": 0, "action": null, "payload": {}, "at": 0 }] }],
  "llmCalls": [{ "planRunId": "", "actionName": "", "kind": "generate", "provider": "albedo", "model": "",
                 "inputTokens": 0, "outputTokens": 0, "latencyMs": 0, "ok": true, "error": null, "at": 0 }],
  "now": 0
}
```

`events[].type` and `payload` are exactly `PlanTraceEvent` from `@repo/core` (`packages/core/src/goap/types.ts`) without the `type`/`attempt`/`action`/`at` fields, which are lifted to the top level; long strings in `state` are cut to 500 characters; `finished` has no `attempt`, so its `attempts` goes into the column. For a run going on now (`running: true`) these are the events that have already happened (from memory; they are not in the DB yet). `now` is the server time; the elapsed time of the running step is counted from it.

**admin-api (BFF) → panel.** The panel does not stitch runs together or guess statuses: `GET /api/requests` returns the same page, and `GET /api/requests/:id` returns a `RequestView` ready to draw. It has `nodes`: `prompt` → `translate` (only if the message was translated: its call is in the first run's `llm_calls`; `label`/`detail.text` is the English text, `durationMs` the translation time, the call in `detail.calls`) → `classify` (if the intent was decided in this request: `label` is the intent, `detail.calls[0].provider` says who decided; a thread without a tool catalog has no decision) → `understand` (its time without translation and intent decision; when `classify` is there, its `label` is the plan goal `key=value …`) → the plan steps → `result`. Each node has a `round`, a `status` (`done|running|browser|failed|skipped|diverged|pending|not_reached|reached|missed`), `startedAt`, `durationMs`, and a `detail` with the tool arguments, browser time, tool answer, effects, error and model calls. `edges` are `next`/`replan`. A browser tool is one step, although the server stops and resumes around it; its `detail.browserMs` is the time from the server's pause to the resume. `now` is returned only for a running request (otherwise the response would change on every read and the live hub would push it forever). Live topics at `/api/live`: `requests` (the list, 3 s) and `request` (one request, 1 s).

### MCP (sites' WebMCP tool catalogs)

When a visitor opens the widget, the page sends its WebMCP tools (`POST /v1/widget/tools`). The orchestrator keeps them in `mcp_catalogs` (one version per channel: a hash of the canonical tool list, i.e. names, descriptions, schemas; announcing the same catalog again only increments `registrations` and `lastSeenAt`; the last 5 versions are kept) and **does not classify the same catalog again** (an in-memory cache by the same hash, 32 catalogs; changing any description or schema = another hash = a new classification; a restart drops the cache).

`GET /v1/admin/mcp` →

```json
{ "items": [{ "channelId": "", "channelSlug": "shop", "channelName": "Shop",
              "tools": [{ "name": "search_products", "description": "…", "inputSchema": {} }],
              "toolCount": 1, "firstSeenAt": 0, "lastSeenAt": 0, "registrations": 3, "versions": 1 }] }
```

One entry per channel, its newest catalog version (`firstSeenAt` is when this version first arrived). **admin-api (BFF)** parses each tool's `inputSchema` into a parameter list (`name`, a `type` like `string`/`string[]`, `description`, `required`, `values` for an enum): `GET /api/mcp`, live topic `mcp` (10 s).

### Channels

| Method | Path | Body | Response |
|---|---|---|---|
| GET | `/v1/admin/channels?page=&pageSize=` | — | `{ "items": [Channel], "total": 3 }` |
| POST | `/v1/admin/channels` | `{ "slug", "name", "kind": "web", "accessMode", "allowedOrigins": [], "catalogLanguage"?: "ru" }` | `{ "channel": Channel, "secretKey": "..." }` |
| PATCH | `/v1/admin/channels/:id` | `{ "name"?, "accessMode"?, "allowedOrigins"?, "catalogLanguage"?, "disabled"?: boolean }` | `{ "channel": Channel }` |
| POST | `/v1/admin/channels/:id/rotate-keys` | — | `{ "channel": Channel, "secretKey": "..." }` |

`secretKey` is returned only in these two responses; it is stored as a hash. Only `kind: "web"` channels are created through the API; `telegram`/`cli` are created by a migration. `slug` is `^[a-z0-9][a-z0-9-]*$`, up to 64 characters; a taken `slug` → `409`. `rotate-keys` changes both the `publishableKey` and the `secretKey`. Fields left out of a PATCH do not change.

Paging (`GET /v1/admin/channels`, `GET /v1/admin/blocked-ips`): `pageSize` 1…100, `page` ≥ 1 (1 by default). Without `pageSize` the whole list is returned (`page` is ignored). `total` is the full number of rows, independent of the page; a page past the end → `items: []`. The order is deterministic: channels by `createdAt` (oldest first), then by `id`; blocks newest first.

A channel is not only a "site": it is any entry point (telegram, discord, slack, cli, jira, a widget on a site…). `kind: "web"` is the only kind created through the API, and the only one with widget keys and `allowedOrigins`.

`catalogLanguage` is a language code (`^[a-z]{2}(-[A-Z]{2})?$`, not a name; otherwise `422` from the orchestrator and `400 invalid_language` from admin-api): the language the site's product names are written in. The search query goes to the site's tool in that language whatever the shopper wrote: for `en`, from the message's English translation; for `ru`, from the message itself (the `extractProductRequestRu` rules); for other languages, the shopper's words as they are. It lands in `WorldState` as the `catalogLang` fact (internal; delta models do not see it).

### IP blocks

| Method | Path | Body | Response |
|---|---|---|---|
| GET | `/v1/admin/blocked-ips?page=&pageSize=` | — | `{ "items": [BlockedIp], "total": 1 }` |
| POST | `/v1/admin/blocked-ips` | `{ "ip": "1.2.3.4", "channelId"?: "...", "reason": "...", "expiresInHours": 24 }` | `{ "item": {...} }` |
| DELETE | `/v1/admin/blocked-ips/:id` | — | `204` |

`BlockedIp` = `{ "id", "ipHash", "ip": "1.2.3.4" | null, "channelId": null, "reason", "createdAt", "expiresAt" }`.

**Hash or IP.** A block always matches on `ipHash` = `sha256(IP_HASH_SALT:ip)`. The clear-text IP is stored in addition and only for the admin panel (to show it, to look it up in whois): `blocked_ips.ip` (`null` on rows created before this field) and `users.last_ip`. `expiresInHours` is required (> 0): IPs are often shared, so a permanent block is not allowed. Anonymous users (with their `last_ip`) are deleted after `ANON_RETENTION_HOURS` of inactivity; an identified user's `last_ip` stays as long as the user exists. An unknown `channelId` → `404`.

### Agents

| Method | Path | Body | Response |
|---|---|---|---|
| GET | `/v1/admin/agents` | — | `{ "items": [Agent] }` |

```ts
interface Agent {
  id: string;                    // "beta-text" | "gamma-decision"
  name: string;
  role: "text" | "decision" | "function-call"; // text (LLM) / typed decisions (Laya) / JSON arguments of a function call (delta)
  endpoint: string;              // base URL without login/password, query and fragment
  model: string | null;          // null for the decision agent
  status: "up" | "down";
  latencyMs: number | null;      // /health response time; null if down
  checkedAt: number;
}
```

The list comes from the orchestrator's configuration (`LLM_BASE_URL`/`LLM_MODEL` for the text agent, `LAYA_API_BASE_URL` for the decision agent). On each request the orchestrator calls `GET <base without /v1>/health` in parallel with a 1.5 s timeout and no auth keys; a network error, a timeout or a non-2xx give `down`, and the request itself does not fail.

### Agent settings and provider keys

Per-agent overrides of the env values (`LLM_*` for `beta-text`, `FUNCTION_CALL_*` for `delta-function-call`, `LAYA_*` for `gamma-decision`). Ids: `beta-text`, `delta-function-call`, `gamma-decision`; an unknown id is `404`. `gamma-decision` can be read but not changed or tested (`400`): Laya stays on its env server.

| Method | Path | Body | Response |
|---|---|---|---|
| GET | `/v1/admin/agents/:id` | — | `AgentSettings` |
| PATCH | `/v1/admin/agents/:id` | `AgentSettingsPatch` | `AgentSettings` |
| POST | `/v1/admin/agents/:id/test` | — | `{ "ok": boolean, "answer"?: string, "error"?: string, "latencyMs": number }` |
| GET | `/v1/admin/provider-keys` | — | `{ "items": [ProviderKey] }` |
| PUT | `/v1/admin/provider-keys/:name` | `{ "key": string }` | `ProviderKey` (adds or replaces) |
| DELETE | `/v1/admin/provider-keys/:name` | — | `{ "ok": true }`; agents that picked it fall back to env |

```ts
interface AgentSettingsPatch {   // a field left out stays, null clears it (= the env value)
  source?: "local" | "external" | null;
  baseUrl?: string | null;       // http(s) URL
  model?: string | null;
  providerKey?: string | null;   // name of a provider key; 400 if it does not exist
  parameters?: {                 // replaced as a whole; null or {} clears
    temperature?: number;        // 0..2
    reasoningEffort?: "none" | "low" | "medium" | "high";
    extraBody?: Record<string, unknown>; // extra request-body fields, e.g. { "provider": { "require_parameters": true } }
  } | null;
}
interface AgentSettings {
  id: string;
  editable: boolean;             // false for gamma-decision
  overrides: { source, baseUrl, model, providerKey, parameters };   // as saved, null = not set
  defaults: { baseUrl, model, temperature, reasoningEffort };       // today's env values (the placeholders)
  effective: { source, baseUrl, model, provider, temperature, reasoningEffort, extraBody }; // what the agent runs with
  updatedBy: string | null;      // X-Admin-Id of the last save
  updatedAt: number | null;
}
interface ProviderKey { name: string; mask: string; updatedBy: string; updatedAt: number } // mask = "••••" + last 4 characters
```

- **Effective = override if set, else env.** `source: "local"` ignores `baseUrl`/`model`/`providerKey` (the env server is used); parameters apply either way. The env API key is never sent to a base URL that differs from the env one: such an agent uses the picked provider key, or none.
- **Keys** are stored AES-GCM encrypted with a key derived from `PROVIDER_KEYS_SECRET` (without it `PUT /provider-keys` is `400`). No route returns a key, base URLs are returned without login/password/query.
- **No restart:** a save rebuilds the agent; a run already going keeps the one it started with. `GET /v1/admin/agents` (health) and `llm_calls` (`provider` = the picked key's name, `model`) use the effective values. Shortcut: delta can be switched on by a saved URL only if a base URL was in effect at startup.
- **Test** sends one plain chat completion (`max_tokens` 16) with the effective settings, also for delta (it is not schema-constrained); a failing call is `200` with `ok: false`.

## Widget API (public, for the web chat widget on a site)

Does not use `HARNESS_API_KEY`/`ADMIN_API_KEY`. The browser authenticates with the channel's publishable key (only to get a visitor token), and then with the visitor token. On every request the `Origin` must be in the channel's `allowedOrigins` (no `Origin` → `403`).

Headers:

- `X-Publishable-Key: pk_...`, only for `POST /v1/widget/visitors`;
- `X-Visitor-Token: <token>`, for the rest of `/v1/widget/*`.

**CORS**: `OPTIONS /v1/widget/*` → `204` if the `Origin` is in the `allowedOrigins` of at least one enabled web channel (a preflight carries no keys; the specific channel is checked on the request itself), otherwise `403`. Responses to an allowed `Origin` carry `Access-Control-Allow-Origin: <origin>` and `Vary: Origin`.

The visitor token is 32 random bytes (base64url); the DB keeps only its sha256. Its lifetime slides: `ANON_RETENTION_HOURS` (24 h) from the last use. Every request with the token extends it and updates the user's `lastSeenAt` and `last_ip`.

### `POST /v1/widget/visitors`

No body. Creates an anonymous channel user → `201` `{ "visitorToken": "...", "expiresAt": 0 }`.

| Status | When |
|---|---|
| `401` | unknown publishable key |
| `403` | `Origin` not in `allowedOrigins`, channel disabled, IP blocked |
| `429` | more than `WIDGET_VISITORS_PER_HOUR_PER_IP` new tokens from one IP in an hour |

### `POST /v1/widget/threads`

No body. A new visitor conversation → `201` `{ "threadId": "<our id>" }`.

### `POST /v1/widget/tools`

```json
{
  "threadId": "<from /v1/widget/threads>",
  "webmcpTools": [
    { "name": "search_products", "description": "...", "inputSchema": { "type": "object", "properties": {} } }
  ]
}
```

Registers the list of WebMCP tools the widget currently sees in the browser through `navigator.modelContext` (empty in `toolMode: "mcp"`, and today in any real browser; see [Laya autopilot](/docs/drafts/laya-autonomous-webmcp/#WebMCP--round-trip-with-the-browser)). Each tool is classified once through Laya (`createWebMcpActions`, `@repo/core`) and cached on the server **in memory, by threadId**. The widget calls this **once when the panel opens** (and again when `toolMode` changes), not with every message: a real catalog (a dozen or more tools with real descriptions and schemas) is several kB, and reclassifying it through Laya on every message was slow and, together with its size, led to `413` on the very first message. An empty list (`webmcpTools: []`) clears this thread's cache (for example on switching to `mcp` mode). `POST /v1/widget/messages` and `POST /v1/widget/tool-results` no longer accept the catalog; the server takes it from the cache.

The size of `webmcpTools` as a JSON string is capped by `WIDGET_MAX_WEBMCP_TOOLS_CHARS` (20000 by default, much more than `WIDGET_MAX_TEXT_CHARS`; registration is one-off, not per message): `413` when over. Success → `204`, no body.

### `POST /v1/widget/messages`

```json
{
  "threadId": "<from /v1/widget/threads>",
  "text": "...",
  "page": "/ru/store/greenleaf?q=milk",
  "customerContext": { "country": "Kazakhstan", "city": "Qyzylorda" }
}
```

`page` is optional: the `pathname + search` of the page the visitor is on now (without the origin and `#hash`; the language in the path `/ru/…` and the parameters stay, they are part of the address; up to 512 characters, otherwise `422`). The widget sends it again with every `/messages` and every `/tool-results` (a WebMCP tool may have changed the page). In `WorldState`: `page:path` (as received) and `page:lang` (from a `/ru/` prefix or `?lang=`/`?locale=`); Laya gets `{ message, page, lang }` when deciding the intent. A navigation tool (intent `navigate`) is not called in the browser if the destination is the same page (`samePage`: the language and `utm_*`/`gclid`/… do not count, the destination's parameters are compared as a set).

`customerContext` is an optional flat object (`Record<string, string | number | boolean>`, no nesting) of what the site integration already knows about the visitor and the browser cannot reliably detect itself (for example, a delivery city picked in the site's own UI rather than by geolocation; see the `customer-context` attribute in `packages/pleiades-widget`). Each field lands in the run's `WorldState` as `customer:<key>` (`customer:country`, `customer:city`, …), namespaced so it never clashes with internal facts (`threadId`, `replied`, `messageIntent`, …). The orchestrator itself does not interpret these facts, it only passes them on to the catalog's actions (see [Laya autopilot](/docs/drafts/laya-autonomous-webmcp/#Priority--not-every-message-is-a-task)).

The size of `customerContext` as a JSON string is capped by the same `WIDGET_MAX_TEXT_CHARS` as `text`: `413` when over.

The response is the same NDJSON stream as `/v1/messages` (`delta`/`done`/`error`), plus a non-terminal `step` line (progress) and a terminal `tool_call` line:

```json
{ "type": "step", "id": "search_products", "phase": "running", "text": "Ищу «cheese»…" }
{ "type": "step", "id": "search_products", "phase": "done", "text": "Нашёл: Mozzarella Cheese" }
```

The terminal `error` line tells two cases apart:

```json
{ "type": "error", "code": "task_failed", "message": "no plan reached the goal",
  "hint": "No products matched \"french baget\". Try a broader word…" }
{ "type": "error", "message": "…" }
```

When a task could not be done (nothing found, the tool refused), the orchestrator does not return a bare error: it runs one more `runPlan` with the goal `{ replied: true }`, and **beta-text** itself explains what went wrong and passes on the site's advice (the failed step and the tool's last answer go into the reply prompt). Such a turn ends with the usual `done` after `delta`, while the request in the admin panel stays `failed`. An `error` line with `code: "task_failed"` comes only if even the explanation failed (the text model is unavailable): the server did its work, but the site could not fulfil the request, a problem of the request, not the connection. `hint` is the site tool's last answer (`webmcp:*:text`, up to 400 characters): its own advice on what to try. No `code` means a server-side failure. A lost connection the client detects itself (no response at all). The widget shows three different lines (`request` + `hint`, `failed`, `network`), and only `network`/`forbidden` block sending.

`step` is "what is happening now" for the user, as ready text in their language (`page:lang`: Russian/Kazakh → Russian, others → English; no page language → Russian). `id` is the plan action's name; the next line with the same `id` **replaces** the previous one (started → finished). `phase`: `running` | `done` | `failed`. They arrive before `delta`; after `tool_call` and a resume through `/tool-results` the stream continues with the same `id`s. Actions without a description are silent (for example the model's reply itself, which goes as `delta`). Clients that do not know `step` (CLI, Telegram, MCP) ignore the line.

The terminal `tool_call` line:

```json
{ "type": "tool_call", "tool": "search_products", "arguments": { "query": "..." }, "callId": "..." }
```

It comes instead of `done`/`error` when the run needs a WebMCP tool call that only the browser itself can make (see [Laya autopilot](/docs/drafts/laya-autonomous-webmcp/)). The stream closes there; the widget calls the tool through `navigator.modelContext` and continues with `POST /v1/widget/tool-results`.

### `POST /v1/widget/tool-results`

```json
{
  "threadId": "<the same thread>",
  "callId": "<callId from tool_call>",
  "tool": "search_products",
  "result": { "...": "..." },
  "isError": false
}
```

Resumes a run that stopped on `tool_call`: the server loads the saved checkpoint (`state` + `goal`, exactly the goal the plan was after from the start, not reclassified) and the same cached tool catalog (`POST /v1/widget/tools`), merges in the tool's outcome (`webmcp:<tool>:result` = `"ok"`/`"error"` in `WorldState`) and continues `runPlan`, up to one more `tool_call` if a second call is needed, or up to `done`. The server does not read `callId`. The text from `result` (MCP `content[].text` or a string, up to 4000 characters) goes into `WorldState` as `webmcp:<tool>:text`, and the next step reads it (for example, the first product "in stock" is taken from the search answer for `add_to_cart`); `isError` sets `webmcp:<tool>:result`. If there is nothing to resume (the checkpoint expired by `WORLD_STATE_RETENTION_HOURS`, a stale `callId`, the thread never waited), it comes back as an ordinary `error` line inside the already started stream, not as a separate HTTP status (the common statuses below, `404`/`429`/etc., are still checked before the stream starts).

The response is the same NDJSON stream (`delta`/`done`/`error`/`tool_call`).

### `GET /v1/widget/threads/:id/messages`

→ `200`

```json
{ "items": [{ "id": "1", "role": "user" | "assistant", "content": "...", "createdAt": 0,
  "steps": [{ "id": "search_products", "phase": "done" | "failed", "text": "Нашёл: …" }] }] }
```

The thread's latest messages (≤ `MESSAGE_RETENTION_PER_USER`), oldest to newest. The `content` of a user message is the text as typed (with line breaks and indentation), not the normalised string the model sees. `steps` (only on a reply that used tools) are the "flow" lines (✓ Found: …) the visitor saw in the stream: they are saved in each run's `plan_runs.steps` and stitched along the request chain (a step keeps its first position and its last phase; a line still `running` is not shown).

### Common statuses for requests with a visitor token

| Status | When |
|---|---|
| `401` | no/unknown/expired token (a new token comes from `/v1/widget/visitors`) |
| `403` (empty body) | `Origin` not in the token channel's `allowedOrigins`; user blocked; channel disabled; channel in `whitelist` mode and the visitor not whitelisted; IP blocked (`blocked_ips`, globally or for the channel, not expired). The model is not called |
| `404` | the thread does not belong to this visitor (checked by owner, not by the id in the request) |
| `413` | `text`/`customerContext` longer than `WIDGET_MAX_TEXT_CHARS`, or (on `/v1/widget/tools`) `webmcpTools` longer than `WIDGET_MAX_WEBMCP_TOOLS_CHARS` |
| `429` | more than `WIDGET_MESSAGES_PER_MINUTE` messages per token or `WIDGET_IP_MESSAGES_PER_MINUTE` per IP per minute |

Limits are in process memory and reset on restart. The client IP is taken by `CLIENT_IP_SOURCE`: `socket` (from the connection, the default), `cf-connecting-ip` (the Cloudflare header, as in compose) or `xff-rightmost` (the `TRUSTED_PROXY_HOPS`-th element of `X-Forwarded-For` from the right; the left elements are written by the client). Without the needed header the connection address is used. Blocks and limits match on `sha256(IP_HASH_SALT:ip)`; the visitor's clear-text IP is written to `users.last_ip` only for the admin panel (see [IP blocks](#IP-blocks)).

## `POST /v1/billing/polar` (Polar webhook)

Public: no bearer key, the signature is the credential. The route exists only when `POLAR_WEBHOOK_SECRET` is set (otherwise `404`).

- **Verification** (Standard Webhooks): headers `webhook-id`, `webhook-timestamp` (seconds), `webhook-signature` (`v1,<base64>`, several separated by spaces). HMAC-SHA256 over `${id}.${timestamp}.${raw body}`, base64, compared in constant time; the body is read raw (`parse: "text"`), never re-serialized. A timestamp more than 5 minutes from now (either way) is rejected. Key: for a `whsec_` secret the base64 part is decoded (Standard Webhooks); the UTF-8 bytes of the whole secret string are tried as well, which is what Polar's older endpoints and user-provided secrets use (its SDK base64-encodes the string before handing it to the library). Both are accepted.
- **Idempotent** by `webhook-id` (table `billing_webhooks`): a repeat is answered `200 {"ok":true,"duplicate":true}` and not applied. The id is recorded in the same transaction as the change, so a failed apply can be redelivered.
- **Events**: every `subscription.*` event (`created`, `active`, `updated`, `cycled`, `canceled`, `uncanceled`, `revoked`, `past_due`) carries the whole subscription and overwrites its row in `subscriptions` (keyed by Polar id). Out of order: an event whose `data.modified_at` is older than the stored one is skipped (equal or newer wins); without `modified_at` the last delivery wins. `channel_id` is never touched by an event. `order.paid` and any other type are only logged.
- Statuses: `200` ok / duplicate; `400` signed but not JSON or a `subscription.*` payload without `id`, `customer_id`, `status`; `401` missing or wrong signature or a stale timestamp.
- Config: `POLAR_WEBHOOK_SECRET`; `POLAR_DASHBOARD_URL` (optional, the prefix of the subscription page in Polar for the panel's link).

## `POST /v1/channels/:slug/identify` (server-to-server, the integrating site's backend)

`Authorization: Bearer <the channel's secretKey>` (issued when the channel's keys are created/rotated in the admin panel; compared by hash in constant time).

```json
// request
{ "visitorToken": "...", "externalUserId": "<account id on the site>" }
// response 200
{ "userId": "<our id>", "merged": false }
```

- No identified user with this `externalUserId` in the channel → the anonymous user becomes identified (same `userId`), `merged: false`.
- There is one → a merge in one transaction: threads, messages (trimmed again to `MESSAGE_RETENTION_PER_USER`), the usage log, GOAP runs and visitor tokens move to the existing user; a block or whitelisting on either of the two rows is kept; the anonymous row is deleted; the visitor's `last_ip` moves to the existing user. `merged: true`, `userId` is the existing user's.
- Repeating the same request → `200` with the same `userId`, `merged: false`.

| Status | When |
|---|---|
| `401` | wrong secret key (or the channel is not web) |
| `404` | unknown slug; the token is unknown, expired or issued by another channel |
| `409` | the token is already bound to another `externalUserId` |

### Intents (`intent_examples`)

The message intent classifier (`classifyMessageIntentDetailed`, only when the thread has the site's tool catalog) goes like this: the words for `checkout`/`removeFromCart` (only words, never the model) → **the channel's memory** (approved examples: an exact match of the normalised English text, then naive Bayes, silent below 0.85 confidence or when the winner is `checkout`/`removeFromCart`) → **Laya** on the English translation → `chat`. If Laya is unavailable, the words, otherwise `chat`. Laya's answer is saved as an example with status `pending` and **affects nothing** until an admin approves it; a plan's success does not count as confirmation (a plan can run with the wrong goal too), nor do repeats (Laya is deterministic). Each channel has its own memory; a new site starts empty.

`GET /v1/admin/intents?page=&pageSize=&status=&channelId=` (newest first) →

```json
{ "items": [{ "id", "channelId", "channelName", "textKey", "sample", "intent", "source": "laya" | "admin",
  "status": "pending" | "approved" | "rejected", "planRunId", "seenCount", "createdAt", "updatedAt" }], "total" }
```

`PATCH /v1/admin/intents/:id` `{ status?, intent? }` → `{ item }` (unknown id → `404`, unknown value → `422`). A new `intent` is the admin's label (`source: admin`) and is `approved` at once; after any decision the channel's model is rebuilt. admin-api: `GET /api/intents`, `PATCH /api/intents/:id`, live topic `intents` (5 s).
