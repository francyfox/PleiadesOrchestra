---
title: Admin API contract
---

# HTTP contract of `alpha-orchestrator` for the admin panel and transports

The source of truth for developing `apps/alpha-orchestrator` (the server), `apps/admin-api` (a client; also the panel's BFF) and `apps/telegram-bot`/`apps/cli` (clients) in parallel. Design and motivation: [Sessions and admin panel plan](/docs/drafts/sessions-and-admin-plan/). Change the contract, change this page in the same PR.

The `apps/admin` panel does not call this API directly: it is a static SPA that talks to `apps/admin-api` (`/api/*`, Elysia, Scalar API reference at `/api/docs`), which calls this API with the `ADMIN_API_KEY` and an `X-Admin-Id` from the administrator's session. The panel ↔ `admin-api` contract is described by TypeBox schemas in `apps/admin-api/src/schemas/` and documented by Swagger; the DTOs below are the same as there.

General rules:

- All times are epoch ms (`number`).
- JSON, `content-type: application/json`, except the NDJSON stream of `/v1/messages`.
- An error is any non-2xx; the body is not part of the contract (clients check `!response.ok`).
- Identifiers are strings.

## Transport API (`Authorization: Bearer <HARNESS_API_KEY>`)

### `POST /v1/access`

Registers a channel visitor (if not there yet), updates `lastSeenAt`/`displayName`, and answers whether they are allowed. The message text is not sent here.

```json
// request
{ "channel": "telegram", "externalUserId": "123456", "displayName": "Ivan" }
// response 200
{ "allowed": true, "userId": "<our uuid>" }
```

`channel` is the slug of an existing channel; an unknown slug → `404`. `displayName` is optional. When the channel's owner has no plan in effect or no balance (see [Suspension](/docs/drafts/accounts-and-billing-plan/)), the answer is `{ "allowed": false, "reason": "suspended", "userId": "..." }`; transports stay silent, as for a blocked sender. `reason` is absent otherwise.

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

`POST /v1/chat/completions` (`HARNESS_API_KEY`): an OpenAI-compatible pass-through to the reply model in effect (`beta-text` agent settings), no planner. The body is sent as given with `model` replaced by beta's (its key, `reasoning_effort` and extra body added); the upstream status and body, a stream included, come back unchanged. Not in the usage ledger. Used by `apps/benchmark` (`bun efficiency`) to run the same text model without the orchestrator.

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
  ownerId: string | null;        // admin-api account id of the owner; null = staff-owned
}
```

### Visitors

A chat visitor (what used to be called a "user"; "users" are now the paying accounts). `AdminVisitor` carries `id` (opaque, unchanged) and `name` = `adjective_animal_xxxxxx` (generated on first contact, also for identified visitors, who keep the site's `displayName` too; **not unique**, shown next to the id). Routes were renamed `/v1/admin/users*` → `/v1/admin/visitors*`; the old paths answer `404`. The DB table is `visitors` (columns `visitor_id`). The transport and integration wire names `userId` (`/v1/access`, `/v1/messages`, identify) are unchanged.

`GET /v1/admin/visitors`

Query: `channel` (slug), `kind`, `status`, `q` (search by displayName, generated name or externalUserId), `sort` = `lastSeenAt` | `createdAt` | `tokens` (`lastSeenAt` by default), `order` = `asc` | `desc` (`desc` by default), `from`/`to` (the period for `usage`), `cursor`, `limit` (1–200, 50 by default).

```json
{ "items": [AdminVisitor], "nextCursor": "opaque" | null, "total": 123 }
```

An invalid query (an unknown enum value and so on) → `422`.

`cursor` is an opaque string; the client passes it back as is. `total` is the number of visitors matching the filters.

`GET /v1/admin/visitors/:id` →

```json
{
  "visitor": AdminVisitor,
  "messages": [AdminMessage],          // the last ≤10, oldest to newest
  "usageByDay": [{ "day": "2026-09-24", "inputTokens": 0, "outputTokens": 0, "calls": 0, "callsWithoutUsage": 0 }],
  "usageByModel": [{ "model": "vikhr-llama-3.2-1b", "kind": "generate", "inputTokens": 0, "outputTokens": 0, "calls": 0, "callsWithoutUsage": 0, "avgLatencyMs": 0 }]
}
```

`usageByDay` covers the last 30 days (UTC); days without calls are omitted.

| Method | Path | Body | Response |
|---|---|---|---|
| POST | `/v1/admin/visitors/:id/whitelist` | — | `{ "visitor": AdminVisitor }` |
| POST | `/v1/admin/visitors/:id/unwhitelist` | — | `{ "visitor": AdminVisitor }` |
| POST | `/v1/admin/visitors/:id/block` | `{ "reason": "..." }` (optional) | `{ "visitor": AdminVisitor }` |
| POST | `/v1/admin/visitors/:id/unblock` | — | `{ "visitor": AdminVisitor }` |
| POST | `/v1/admin/visitors/bulk` | `{ "ids": [..], "action": "whitelist"\|"unwhitelist"\|"block"\|"unblock", "reason"?: "..." }` | `{ "updated": 3 }` |
| DELETE | `/v1/admin/visitors/:id/messages` | — | `204` |

An unknown `:id` → `404`.

### Usage

`GET /v1/admin/usage?groupBy=day|visitor|channel|model&from&to&channel&ownerId`

```json
{ "rows": [{ "key": "2026-09-24", "label": "2026-09-24", "inputTokens": 0, "outputTokens": 0, "calls": 0, "callsWithoutUsage": 0, "avgLatencyMs": 0,
  "costUsd": 0.0123, "price": { "inputPerMillion": 0.09, "outputPerMillion": 0.3 } }] }
```

`costUsd` = tokens × the model's price, summed per row; `null` when the prices could not be fetched (`GET https://openrouter.ai/api/v1/models`, per-token `pricing.prompt`/`completion`, cached a day in memory, a failure is retried after 5 minutes and keeps the previous list). A model with no price (a local one, or unknown to OpenRouter) costs 0. `price` (USD per 1M tokens, `null` = no price) is present on `groupBy=model` rows only. Shortcut: today's price is applied to past tokens.

`key` is a day (`YYYY-MM-DD`, UTC) / visitor id / channel slug / model. `label` is human-readable (for a visitor, the displayName, else the generated name; for deleted anonymous visitors `"(удалён)"` ("deleted") with key `null`). By default `from` = 30 days ago, `to` = now.

`ownerId` (an admin-api account id) counts only calls of the channels that account owns (calls whose channel was deleted have no owner and are left out).

`GET /v1/admin/stats?ownerId` →

```json
{ "visitors": { "total": 0, "pending": 0, "blocked": 0, "anonymous": 0 },
  "usage": { "today": UsageTotals, "last7d": UsageTotals, "last30d": UsageTotals } }
```

With `ownerId` both the visitor counts and the usage cover only that owner's channels.

### Finance (staff money)

`GET /v1/admin/finance?from&to` (default the last 30 days) →

```json
{ "modelSpendUsd": 1.2, "revenueUsd": 10, "lossesUsd": 2.04, "netProfitUsd": 6.76, "ordersCount": 1, "skippedOrders": 0 }
```

`modelSpendUsd` = the `llm_calls` spend by model (as in Usage), `null` when prices could not be fetched (then `netProfitUsd` is `null` too). `revenueUsd` = orders created in the period with status `paid`, `partially_refunded` or `refunded`, USD only, minus `refunded_amount`; other currencies are not converted, only counted in `skippedOrders`. `lossesUsd` = `@repo/tax` `orderBreakdown(...).losses` summed **per order** (the fixed fee is per receipt, so a fully refunded order still costs it). `netProfitUsd = revenueUsd - lossesUsd - modelSpendUsd`. Not scoped by owner.

### Subscriptions (Polar, the "Cloud" plan)

Filled by `POST /v1/billing/polar` (below). `status` is derived: `ended` (Polar `canceled`/`incomplete_expired`, or `ended_at` set), `past_due` (also `unpaid`, `incomplete`), `canceling` (active with `cancel_at_period_end`), `active` (also `trialing`).

| Method | Path | Body | Response |
|---|---|---|---|
| GET | `/v1/admin/subscriptions?status=active\|canceling\|past_due\|ended&accountId=` | — | `{ "items": [Subscription] }` — plans expiring within 7 days first, then by `currentPeriodEnd`, ended last |

```ts
interface Subscription {
  id: string;                       // Polar subscription id
  customerId: string; customerEmail: string | null;
  plan: string | null;              // Polar product name
  status: "active" | "canceling" | "past_due" | "ended";
  startedAt: number | null;
  currentPeriodEnd: number | null;  // the expiry date
  endedAt: number | null;
  accountId: string;                // admin-api account = Polar customer external_id
  polarUrl: string | null;          // POLAR_DASHBOARD_URL + "/" + id; null when unset
}
```

The manual channel link is gone (migration `0021_billing_accounts`: `subscriptions.channel_id` became `account_id`; old rows were dropped and come back with the next Polar event). Enforcement of an ended plan is stage 2 of the billing phase.

#### `GET /v1/admin/accounts/:accountId/billing`

Everything the Billing page needs for one account (admin-api account id). An unknown account is an empty one, not a `404`.

```ts
interface AccountBilling {
  standing:
    | { ok: true; until: number | null }       // until: a canceled/past_due plan holds to this time (cache it); null = until a webhook says otherwise
    | { ok: false; reason: "no_plan" | "plan_expired" | "no_balance"; since: number | null }; // since: when the plan ended
  subscription: Subscription | null;           // the running plan, else the one whose paid period ended last
  balanceUsd: number;                          // TR, 1 TR = 1 USD; negative = overdraft
  orders: { id: string; kind: "plan" | "credits"; amount: number /* cents */; currency: string;
            status: string; createdAt: number; refundedAmount: number /* cents */ }[]; // newest first
  spend: { month: string /* YYYY-MM UTC */; tokens: number; costUsd: number | null }[]; // oldest first, over the account's channels; null = prices unknown
}
```

The ledger (`credit_ledger`, append-only) is in **micro-USD** integers (1 TR = 1_000_000), so a call of $0.00004 is `40` and sums never drift. Rows: `top_up` (+, once per paid credits order), `refund` (-, the growth of the order's refunded amount), `usage` (-, one per priced model call of a channel with an owner, written when the usage recorder flushes; `ref` = `llm_calls.id`; a failed debit is logged and never fails the reply). Local models and staff channels write nothing.

### Performance

`GET /v1/admin/performance?from&to` (the last 30 days by default): model call latencies from the `llm_calls` log.

```json
{
  "rows":    [{ "day": "2026-09-24", "kind": "generate", "calls": 3, "failed": 1, "p50": 4000, "p90": 9000, "p99": 9000, "max": 9000, "tokensPerSecond": 37.5 }],
  "overall": [{ "kind": "generate", "calls": 3, "failed": 1, "p50": 4000, "p90": 9000, "p99": 9000, "max": 9000, "tokensPerSecond": 37.5 }]
}
```

- `rows` are per day (UTC) × `kind` (`ingest` / `generate` / `decision` / `translate`; `translate` only in rows from before 2026-10-27, when the CTranslate2 translator was removed (alpha-understand translates now, its calls are `decision` with `action_name: alpha-understand`); `classify` is the message intent decision, `action_name: classify`, `provider` = `laya` / `memory` / `rules`, whichever decided). `overall` is per `kind` over the whole period.
- Percentiles are nearest-rank over the `latencyMs` of all calls, including failed ones (`failed` is their count).
- `tokensPerSecond` is the median of `outputTokens / latency` over successful calls with usage; `null` if there are none (Laya has no tokens).

### GOAP

### Requests (chains of runs)

One user message = one **request**: the first run plus one more per browser tool answer (a run stops on `waiting` and is resumed by a new one). The runs of one request are linked by `plan_runs.root_run_id` (the root is the first run itself; `NULL` on old rows reads as "its own root"). The chain's traces live as long as at least one reply in `messages` does (see `trimUserHistory`).

`GET /v1/admin/requests?page=&pageSize=&status=&intent=` (newest first; 25 without `pageSize`; `status` is one of the values below, `intent` is an exact match on the row's `intent`; with a filter, `total` is the number of matching requests; the status is not a DB column, so with a filter the orchestrator builds the summaries of all requests and cuts the page afterwards) →

```json
{ "items": [{ "id": "<id of the first run>", "visitorId": "", "threadId": "", "prompt": "купи 1 сыр",
              "intent": "addToCart", "status": "running" | "waiting" | "succeeded" | "failed" | "abandoned",
              "steps": ["choose_store", "search_products"], "runs": 2, "startedAt": 0, "durationMs": 0 }],
  "total": 1 }
```

`status`: `running` means a run is going on now (the `ActiveRuns` registry in the orchestrator's memory); `waiting` means the last run stopped on a browser tool that has not answered yet (< 5 min); `abandoned` means it has not answered for more than 5 minutes; otherwise `succeeded`/`failed` by the last run. `steps` are the actions in order of completion plus the one the browser is running now. `durationMs` of a running request counts up to "now". `prompt` is cut to 200 characters; for requests recorded before the column existed, it comes from the first plan's `userMessage`.

`GET /v1/admin/requests/:id` (the id of any run in the chain works; unknown → `404`) →

```json
{
  "request": { "id": "", "visitorId": "", "threadId": "", "prompt": "", "intent": "addToCart", "status": "succeeded",
               "goal": {}, "reply": "the assistant's reply or null", "startedAt": 0, "durationMs": 0 },
  "runs": [{ "id": "", "createdAt": 0, "durationMs": 0, "succeeded": true, "running": false,
             "events": [{ "seq": 0, "type": "planned", "attempt": 0, "action": null, "payload": {}, "at": 0 }] }],
  "llmCalls": [{ "planRunId": "", "actionName": "", "kind": "generate", "provider": "albedo", "model": "",
                 "inputTokens": 0, "outputTokens": 0, "latencyMs": 0, "ok": true, "error": null, "at": 0 }],
  "now": 0
}
```

`events[].type` and `payload` are exactly `PlanTraceEvent` from `@repo/core` (`packages/core/src/goap/types.ts`) without the `type`/`attempt`/`action`/`at` fields, which are lifted to the top level; long strings in `state` are cut to 500 characters; `finished` has no `attempt`, so its `attempts` goes into the column. For a run going on now (`running: true`) these are the events that have already happened (from memory; they are not in the DB yet). `now` is the server time; the elapsed time of the running step is counted from it.

**admin-api (BFF) → panel.** The panel does not stitch runs together or guess statuses: `GET /api/requests` returns the same page, and `GET /api/requests/:id` returns a `RequestView` ready to draw. It has `nodes`: `prompt` → `translate` (only in requests from before 2026-10-27, when a message was translated by CTranslate2: its call is in the first run's `llm_calls`; `label`/`detail.text` is the English text, `durationMs` the translation time, the call in `detail.calls`) → `classify` (if the intent was decided in this request: `label` is the intent, `detail.calls[0].provider` says who decided; a thread without a tool catalog has no decision) → `understand` (its time without translation and intent decision; when `classify` is there, its `label` is the plan goal `key=value …`) → the plan steps → `result`. Each node has a `round`, a `status` (`done|running|browser|failed|skipped|diverged|pending|not_reached|reached|missed`), `startedAt`, `durationMs`, and a `detail` with the tool arguments, browser time, tool answer, effects, error and model calls. Each `detail.calls[]` entry carries `choices` (`null` for a call that decides nothing): for every choice question the call answered, `{ question, chosen, options }` with the probability of every option (calibrated), so the panel can draw all of them. `edges` are `next`/`replan`. A browser tool is one step, although the server stops and resumes around it; its `detail.browserMs` is the time from the server's pause to the resume. `now` is returned only for a running request (otherwise the response would change on every read and the live hub would push it forever). Live topics at `/api/live`: `requests` (the list, 3 s) and `request` (one request, 1 s).

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
| GET | `/v1/admin/channels?page=&pageSize=&ownerId=` | — | `{ "items": [Channel], "total": 3 }` (`ownerId` filters, `total` too) |
| POST | `/v1/admin/channels` | `{ "slug", "name", "kind": "web", "accessMode", "allowedOrigins": [], "catalogLanguage"?: "ru", "ownerId"?: "acc_1" }` | `{ "channel": Channel, "secretKey": "..." }` (no `ownerId` = staff-owned) |
| PATCH | `/v1/admin/channels/:id` | `{ "name"?, "accessMode"?, "allowedOrigins"?, "catalogLanguage"?, "disabled"?: boolean }` | `{ "channel": Channel }` |
| POST | `/v1/admin/channels/:id/rotate-keys` | — | `{ "channel": Channel, "secretKey": "..." }` |

| DELETE | `/v1/admin/owners/:ownerId/channels` | — | `{ "deleted": 2 }` |

`DELETE /v1/admin/owners/:ownerId/channels` removes every channel of that account when the account is deleted (admin-api calls it first; if it fails the account is kept). Visitors, messages, threads, runs, visitor tokens, personas, intent examples, blocked IPs and tool catalogs of those channels cascade (foreign keys, `foreign_keys = ON`). `llm_calls` and subscriptions keep their rows with `channel_id` set to `NULL` (`ON DELETE SET NULL`), so spend totals and billing survive; the visitor reference of those calls is cleared too. Idempotent: `deleted: 0` when nothing is left. No new migration was needed for this, only `0020_channel_owner` (`channels.owner_id` text NULL + `channels_owner_idx`). The owner is an id from another database, so there is no foreign key.

`secretKey` is returned only in these two responses; it is stored as a hash. Only `kind: "web"` channels are created through the API; `telegram`/`cli` are created by a migration. `slug` is `^[a-z0-9][a-z0-9-]*$`, up to 64 characters; a taken `slug` → `409`. `rotate-keys` changes both the `publishableKey` and the `secretKey`. Fields left out of a PATCH do not change.

Paging (`GET /v1/admin/channels`, `GET /v1/admin/blocked-ips`): `pageSize` 1…100, `page` ≥ 1 (1 by default). Without `pageSize` the whole list is returned (`page` is ignored). `total` is the full number of rows, independent of the page; a page past the end → `items: []`. The order is deterministic: channels by `createdAt` (oldest first), then by `id`; blocks newest first.

A channel is not only a "site": it is any entry point (telegram, discord, slack, cli, jira, a widget on a site…). `kind: "web"` is the only kind created through the API, and the only one with widget keys and `allowedOrigins`.

`catalogLanguage` is a language code (`^[a-z]{2}(-[A-Z]{2})?$`, not a name; otherwise `422` from the orchestrator and `400 invalid_language` from admin-api): the language the site's product names are written in. The search query goes to the site's tool in that language whatever the shopper wrote: for `en`, from alpha-understand's English text and product names; for `ru`, from the message itself (the `extractProductRequestRu` rules); for other languages, the shopper's words as they are. It lands in `WorldState` as the `catalogLang` fact (internal; delta models do not see it).

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
  role: "text" | "decision" | "function-call" | "understand"; // text (LLM) / typed decisions (Laya) / JSON arguments of a function call (delta) / alpha-understand: English, tasks and quantities of a message in one call
  endpoint: string;              // base URL without login/password, query and fragment
  model: string | null;          // null for the decision agent
  status: "up" | "down";
  latencyMs: number | null;      // /health response time; null if down
  checkedAt: number;
}
```

The list comes from the orchestrator's configuration (`LLM_BASE_URL`/`LLM_MODEL` for the text agent, `LAYA_API_BASE_URL` for the decision agent). On each request the orchestrator calls `GET <base without /v1>/health` in parallel with a 1.5 s timeout and no auth keys; a network error, a timeout or a non-2xx give `down`, and the request itself does not fail.

### Agent models and providers

Which model an agent uses, and the providers file it is picked from. Ids: `beta-text`, `delta-function-call`, `gamma-decision`; an unknown id is `404`. `gamma-decision` can be read but not changed or tested (`400`): Laya speaks its own protocol and stays on its env server (`LAYA_*`).

| Method | Path | Body | Response |
|---|---|---|---|
| GET | `/v1/admin/agents/:id` | — | `AgentModel` |
| PUT | `/v1/admin/agents/:id/model` | `{ "provider": string, "model": string }` | `AgentModel`; `400` if the file has no such model |
| POST | `/v1/admin/agents/:id/test` | — | `{ "ok": boolean, "answer"?: string, "error"?: string, "latencyMs": number }` |
| GET | `/v1/admin/providers` | — | `{ "items": [Provider] }` |
| PUT | `/v1/admin/providers/:id` | `{ "name", "baseUrl", "apiKey"? }` | `{ "items": [Provider] }` (adds or changes; no `apiKey` keeps the saved key, `""` removes it) |
| DELETE | `/v1/admin/providers/:id` | — | `{ "items": [Provider] }` (with its models) |
| PUT | `/v1/admin/providers/:id/models[?fromProvider=<id>&fromId=<model id>]` | `ProviderModel` | `{ "items": [Provider] }` (adds or changes by `id`; with `from*` naming another id or provider, that model is removed and the agents that picked it pick this one) |
| DELETE | `/v1/admin/providers/:id/models?model=<id>` | — | `{ "items": [Provider] }` |
| GET | `/v1/admin/providers-toml` | — | `{ "toml": string }` (keys masked) |
| PUT | `/v1/admin/providers-toml` | `{ "toml": string }` | `{ "toml": string }`; `400` with the reason if it does not parse or fit |
| POST | `/v1/admin/providers-toml/check` | `{ "toml": string }` | always `200` `{ "errors": { message, line?, path? }[] }`, empty = valid; the save's checks (syntax, schema, masked keys) without writing. `line` (1-based) for syntax errors, `path` (`providers.x.base_url`) for schema errors. admin-api: `POST /api/providers-toml/check` |

Editors (Taplo, Tombi) validate `providers.toml` against `configs/providers.schema.json`, generated from the same schema (`bun run providers:schema`); the file's first line is `#:schema ./providers.schema.json`.

```ts
interface AgentModel {
  id: string;
  provider: string | null;       // null = the env server (nothing picked, or the pick is gone from the file)
  model: string;
  baseUrl: string | null;        // without login/password/query
  updatedBy: string | null;      // X-Admin-Id of the last pick
  updatedAt: number | null;
}
interface ProviderModel {
  id: string;                    // as the server expects it: "google/gemini-2.5-flash", "qwen3:1.7b"
  name: string;
  temperature?: number;          // 0..2; unset = the server's default
  reasoningEffort?: "none" | "low" | "medium" | "high";
  extraBody: Record<string, unknown>; // extra request-body fields, e.g. { "provider": { "require_parameters": true } }
}
interface Provider { id: string; name: string; baseUrl: string; decisionsUrl?: string; apiKey: string; models: ProviderModel[] }
// ProviderModel.types (a non-empty list of "language" | "embedding" | "image" | "video" | "speech" | "transcription" | "reranking" | "decision", the AI SDK's factory names; several for a multimodal model): gamma-decision picks only "decision" models, the other agents only "language"; a wrong pick is 400. decisionsUrl: where decision models are asked (Laya root without /v1, or an OpenRouter-style .../decisions URL), default baseUrl
// apiKey: "••••" + last 4 characters, "$VAR" as written, "" = none — never the key
```

**`providers.toml`** (`PROVIDERS_CONFIG_PATH`, default `configs/providers.toml`; example in `apps/alpha-orchestrator/configs/providers.example.toml`) follows Crush; there is no standard for this shape (no RFC; Open Agent Spec is a proposal, A2A leaves model choice out):

```toml
[providers.openrouter]          # id: a-z, 0-9, -
name = "OpenRouter"
base_url = "https://openrouter.ai/api/v1"
api_key = "$OPENROUTER_API_KEY" # the key, "$ENV_VAR", or nothing

[[providers.openrouter.models]]
id = "qwen/qwen3-30b-a3b-instruct-2507"
temperature = 0
reasoning_effort = "none"
extra_body = { provider = { require_parameters = true } }
```

- **Model parameters live only here.** Env names each agent's server (`LLM_*`, `FUNCTION_CALL_*`); a missing file is created from those servers on first start (keys as `$LLM_API_KEY`-style references). An agent with no pick uses the file's entry for its env server (same base URL and model), else the bare env server without parameters.
- **Keys**: the file is written 0600, gitignored and dockerignored; no route returns a key. The editor gets the text with keys masked; a mask saved back unchanged keeps the saved key, any other mask is refused. Saving from a form or the editor rewrites the file (comments are not kept).
- **No restart:** a pick or a file change rebuilds the agents; a run already going keeps the one it started with. `GET /v1/admin/agents` (health) and `llm_calls` (`provider` = the provider id, `model`) use the model in effect.
- **Test** sends one plain chat completion (`max_tokens` 16) with the model in effect, also for delta (it is not schema-constrained); a failing call is `200` with `ok: false`.

## Widget API (public, for the web chat widget on a site)

Does not use `HARNESS_API_KEY`/`ADMIN_API_KEY`. The browser authenticates with the channel's publishable key (only to get a visitor token), and then with the visitor token. On every request the `Origin` must be in the channel's `allowedOrigins` (no `Origin` → `403`).

Headers:

- `X-Publishable-Key: pk_...`, only for `POST /v1/widget/visitors`;
- `X-Visitor-Token: <token>`, for the rest of `/v1/widget/*`.

**CORS**: `OPTIONS /v1/widget/*` → `204` if the `Origin` is in the `allowedOrigins` of at least one enabled web channel (a preflight carries no keys; the specific channel is checked on the request itself), otherwise `403`. Responses to an allowed `Origin` carry `Access-Control-Allow-Origin: <origin>` and `Vary: Origin`.

The visitor token is 32 random bytes (base64url); the DB keeps only its sha256. Its lifetime slides: `ANON_RETENTION_HOURS` (24 h) from the last use. Every request with the token extends it and updates the user's `lastSeenAt` and `last_ip`.

### `POST /v1/widget/visitors`

No body. Creates an anonymous channel visitor → `201` `{ "visitorToken": "...", "expiresAt": 0 }`.

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
| `402` | `{ "code": "channel_suspended" }`: the channel's owner has no plan or no balance (staff channels never). Sent by `/v1/widget/visitors` and every call with a visitor token, before any model call; the widget shows a neutral "Chat is unavailable right now" and locks the composer |
| `403` (empty body) | `Origin` not in the token channel's `allowedOrigins`; user blocked; channel disabled; channel in `whitelist` mode and the visitor not whitelisted; IP blocked (`blocked_ips`, globally or for the channel, not expired). The model is not called |
| `404` | the thread does not belong to this visitor (checked by owner, not by the id in the request) |
| `413` | `text`/`customerContext` longer than `WIDGET_MAX_TEXT_CHARS`, or (on `/v1/widget/tools`) `webmcpTools` longer than `WIDGET_MAX_WEBMCP_TOOLS_CHARS` |
| `429` | more than `WIDGET_MESSAGES_PER_MINUTE` messages per token or `WIDGET_IP_MESSAGES_PER_MINUTE` per IP per minute |

Limits are in process memory and reset on restart. The client IP is taken by `CLIENT_IP_SOURCE`: `socket` (from the connection, the default), `cf-connecting-ip` (the Cloudflare header, as in compose) or `xff-rightmost` (the `TRUSTED_PROXY_HOPS`-th element of `X-Forwarded-For` from the right; the left elements are written by the client). Without the needed header the connection address is used. Blocks and limits match on `sha256(IP_HASH_SALT:ip)`; the visitor's clear-text IP is written to `users.last_ip` only for the admin panel (see [IP blocks](#IP-blocks)).

## `POST /v1/billing/polar` (Polar webhook)

Public: no bearer key, the signature is the credential. The route exists only when `POLAR_WEBHOOK_SECRET` is set (otherwise `404`).

- **Verification** (Standard Webhooks): headers `webhook-id`, `webhook-timestamp` (seconds), `webhook-signature` (`v1,<base64>`, several separated by spaces). HMAC-SHA256 over <code>{'${id}.${timestamp}.${raw body}'}</code>, base64, compared in constant time; the body is read raw (`parse: "text"`), never re-serialized. A timestamp more than 5 minutes from now (either way) is rejected. Key: for a `whsec_` secret the base64 part is decoded (Standard Webhooks); the UTF-8 bytes of the whole secret string are tried as well, which is what Polar's older endpoints and user-provided secrets use (its SDK base64-encodes the string before handing it to the library). Both are accepted.
- **Idempotent** by `webhook-id` (table `billing_webhooks`): a repeat is answered `200 {"ok":true,"duplicate":true}` and not applied. The id is recorded in the same transaction as the change, so a failed apply can be redelivered.
- **Events**: every `subscription.*` event (`created`, `active`, `updated`, `cycled`, `canceled`, `uncanceled`, `revoked`, `past_due`) carries the whole subscription and overwrites its row in `subscriptions` (keyed by Polar id) for the account `data.customer.external_id` (an event without it is only logged, answered `200`). Out of order: an event whose `data.modified_at` is older than the stored one is skipped (equal or newer wins); without `modified_at` the last delivery wins. `order.paid` / `order.refunded` upsert `orders` (id, account, product, `kind` credits when `product_id` is `POLAR_CREDITS_PRODUCT_ID` else plan, `net_amount` cents, currency, status, created, `refunded_amount`) and, for a credits order, add `+net_amount` to the ledger once (unique on the order id) and `-(growth of refunded_amount)` per refund; a late `order.paid` never shrinks a recorded refund. With `POLAR_PLAN_PRODUCT_ID` set, events of products other than the plan and credits are only logged. Any other type is only logged.
- Statuses: `200` ok / duplicate; `400` signed but not JSON or a `subscription.*` payload without `id`, `customer_id`, `status`, or an `order.paid`/`order.refunded` one without `id`, `status`, integer `net_amount`; `401` missing or wrong signature or a stale timestamp.
- Config: `POLAR_WEBHOOK_SECRET`; `POLAR_CREDITS_PRODUCT_ID`, `POLAR_PLAN_PRODUCT_ID`; `POLAR_DASHBOARD_URL` (optional, the prefix of the subscription page in Polar for the panel's link).

## `POST /v1/channels/:slug/identify` (server-to-server, the integrating site's backend)

`Authorization: Bearer <the channel's secretKey>` (issued when the channel's keys are created/rotated in the admin panel; compared by hash in constant time).

```json
// request
{ "visitorToken": "...", "externalUserId": "<account id on the site>" }
// response 200
{ "userId": "<our id>", "merged": false }
```

- No identified visitor with this `externalUserId` in the channel → the anonymous visitor becomes identified (same `userId`), `merged: false`.
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

## Panel API of `admin-api`: accounts and sign-in

`apps/admin-api` (`/api/*`) is the panel's backend. Its accounts are better-auth users in its own SQLite with a numeric **level**: `0` super admin, `100` admin, `200` user (customer). Staff = level `<= 100`. Errors are codes (`{ "error": "invalid_token" }`), never text. The session is a cookie for both kinds of account.

| Guard | Who | Used by |
|---|---|---|
| `{ admin: true }` | staff (level <= 100); a user gets `403 { "error": "forbidden" }`, no session `401 { "error": "unauthorized" }` | every other orchestrator-backed route, `/api/admins`, `/api/accounts*`, `/api/system*` |
| `{ account: true }` | any signed-in account; routes scope or refuse by `level` themselves | `/api/user/me*`, `/api/channels*` (users: own only), `/api/dashboard`, `/api/live` (users: two topics) |
| super-only checks | level `0` | `POST /api/admins`, `DELETE /api/admins/:id`, editing / rotating someone else's account (`403 { "error": "not_super" }`) |

`last_active_at` of the account is set on an authenticated request (guarded routes and `GET /api/session`) when it is unset or a day old. A daily job deletes level-200 accounts unseen for 180 days (never-active ones count from creation); staff are never deleted.

### Staff: access token instead of a password

- `POST /api/auth/token` `{ token }` returns `200 { ok: true }` and the session cookie. Wrong, malformed, rotated or customer tokens are all `401 { "error": "invalid_token" }`; a banned admin is `403 { "error": "banned" }`; repeated failures lock the client IP for the lockout window (`429 { "error": "too_many_attempts", "retryAfter" }`, `Retry-After`).
- The token is 32 random bytes in base64url (43 characters), shown once on create / rotate. Only its SHA-256 hex is stored (`user.token_hash`), compared in constant time.
- `bun --cwd apps/cli start admin:create --email you@example.com [--name X] [--level 0|100]` creates a staff account and prints its token. The first account is a super admin unless `--level` says otherwise; for an existing staff email it issues a new token (the way into an install that predates tokens).
- `GET /api/session` returns `{ setupRequired, admin: { id, name, email, level, isSuper } | null }`. `admin` is the signed-in account, staff or user; `setupRequired` is true while no staff account exists. `POST /api/auth/logout` ends the session. The old `POST /api/auth/login|register` and `POST /api/admins/:id/password` are gone.

### Admins (`/api/admins`, staff)

| Route | Body | Response |
|---|---|---|
| `GET /api/admins?page&pageSize` | | `{ admins: [{ id, name, email, banned, banReason, createdAt, level, isSuper }], total }` (staff only) |
| `POST /api/admins` (super) | `{ name, email }` | `{ id, email, token }`; `invalid_email` 400, `email_taken` 409 |
| `PATCH /api/admins/:id` (self or super) | `{ name, email }` | `{ id }`; `not_super` 403, `not_found` 404, `invalid_email` 400, `email_taken` 409 |
| `POST /api/admins/:id/token` (self or super) | | `{ id, email, token }`; the old token stops and every session of that admin is deleted (yours too when rotating your own) |
| `POST /api/admins/:id/ban` / `unban` | `{ reason? }` | `{ id }`; `self`, `last_admin`, `super_protected` |
| `DELETE /api/admins/:id` (super) | | `{ id }`; `not_super` 403, `self` 400 |

Email is contact data, not a login. Staff and customers share one email namespace.

### Users (customers, level 200)

- `POST /api/user/register` `{ email, password, name?, locale? ("ru"|"en"|"kk") }` returns `{ ok: true }` and mails a verification link (`<PUBLIC_PANEL_URL>/api/user/verify?token=...`). `400 { "error": "weak_credentials", "min": 12 }`. A taken email also answers `{ ok: true }` and changes nothing (better-auth hides which emails exist). Throttled per IP (`429`).
- `GET /api/user/verify?token=` redirects (302) to `<PUBLIC_PANEL_URL>/user/login?verified=1` (`0` for a bad or expired token).
- `POST /api/user/login` `{ email, password }` returns `{ ok: true }` and the cookie; `400 invalid_credentials` / `missing_credentials`, `403 email_not_verified` (the mail is sent again), `429` like the old password login. Staff accounts always get `invalid_credentials`.
- `POST /api/user/forgot` `{ email }` always returns `{ ok: true }` for a well-formed email (a mail with `<PUBLIC_PANEL_URL>/user/reset?token=...` only for an existing customer).
- `POST /api/user/reset` `{ token, password }` returns `{ ok: true }`, every session of the account is deleted; `400 invalid_token` (unknown, used or expired; tokens live one hour), `400 weak_password` with `min`.
- `GET /api/user/me` returns `{ id, name, email, level, lastActiveAt }` for any signed-in account (`lastActiveAt` is epoch ms or `null`; the panel shows the 180-day inactivity note from it).
- `PATCH /api/user/me` `{ name }` returns the new `Me`. `400 invalid_name` (blank after trim).
- `POST /api/user/me/email` `{ email }` returns `{ ok: true }` and mails a verification link (`<PUBLIC_PANEL_URL>/api/user/verify?token=...`, ru/en text) to the NEW address; the account's email changes only after the link is opened (the 302 goes to `/user/login?verified=1`, the old email stops working then). `400 invalid_email`, `400 same_email`, `429` (shares the per-IP registration budget). A taken address also answers `{ ok: true }`, sends nothing and changes nothing (no probing of registered emails).
- `DELETE /api/user/me` `{ confirmEmail }` (must equal the account email, trimmed, case-insensitive; else `400 { "error": "confirm_mismatch" }`) returns `{ ok: true }`: the channels (orchestrator) are deleted first, then the account and its sessions. If the orchestrator cannot delete the channels: `502`/`503 { message }` and the account is kept.
- The three self-service routes above are for users only; a staff session gets `403 { "error": "forbidden" }`.

### Ownership: channels, dashboard, visitors, flow, blocked IPs, live

A user (level 200) sees and edits only channels with `ownerId = their account id`, and only visitors, requests and IP blocks of those channels. admin-api is the only place that decides this; the orchestrator trusts `ADMIN_API_KEY` and takes `ownerId` as a field (`GET /v1/admin/visitors`, `/visitors/:id`, `/requests`, `/requests/:id`, `/blocked-ips` filter or 404 by it; `POST /v1/admin/visitors/bulk` takes it in the body). Staff IP blocks without a channel stay global; a user's block covers only their channel.

| Route | User | Staff |
|---|---|---|
| `GET /api/channels?page&pageSize&ownerId` | always `ownerId` = own id (the query value is ignored) | all; `ownerId` filters |
| `POST /api/channels` `{ slug, name, accessMode?, allowedOrigins?, catalogLanguage?, ownerId? }` | owner = own id (body `ownerId` ignored) | `ownerId` optional (left out = staff-owned) |
| `PATCH /api/channels/:id`, `POST /api/channels/:id/rotate-keys`, `GET\|PUT /api/channels/:id/persona`, `POST /api/channels/:id/persona/preview` | `404 { "error": "not_found" }` when the channel is not theirs (or does not exist; never 403, no probing), nothing reaches the orchestrator | any channel |
| `GET /api/dashboard?ownerId` | numbers of own channels (stats, usage by day / visitor / channel / model); never `finance` | everything; `ownerId` narrows. Without `ownerId` also `finance` (orchestrator Finance above, last 30 days); the `dashboard` live topic pushes the same body |
| `GET /api/visitors`, `GET /api/requests` (`?ownerId`) | only visitors / requests of own channels (`ownerId` forced) | all; `ownerId` filters |
| `GET /api/visitors/:id`, `GET /api/requests/:id[/trace]`, visitor whitelist / block / unwhitelist / unblock / delete messages | `404` when the visitor / request is not in their channel, nothing is written | any |
| `POST /api/visitors/bulk` | sent with `ownerId`: other owners' visitors are skipped upstream | any |
| `GET /api/blocked-ips` | blocks of own channels only (no global ones) | all |
| `POST /api/blocked-ips` | `channelId` required (`400 invalid_block` without), own channel only (`404 not_found`) | any channel, or none = global |
| `DELETE /api/blocked-ips/:id` | own channel's block only (`404 not_found`) | any |

`Channel` has `ownerId: string | null`. The embed snippet is built by the panel from the channel's `publishableKey`; there is no embed route in admin-api. Every other route (mcp, agents, models, intents, subscriptions, performance, system, admins, accounts) stays staff-only: a user gets `403 { "error": "forbidden" }` (a test walks the whole route table).

**`/api/live` for a user.** The upgrade is open to any signed-in account. A user may subscribe only to `dashboard`, `channels`, `visitors`, `visitor`, `requests`, `request` and `blocked-ips`; any other topic answers `{ type: "error", id, code: "forbidden" }` (new `LiveErrorCode`, the socket stays open). For those, the server sets `params.ownerId` to the session's account id, overwriting whatever the browser sent, so a user can never read another owner's data; the pushed `data` is the body of the matching REST route (a `visitor` / `request` of another owner answers the upstream 404 as an error). Staff may pass `ownerId` in the `dashboard` / `channels` params to filter.

### Billing (`/api/billing`, users)

All `{ account: true }` and **for users only**: staff have no billing, every route answers them `403 { "error": "forbidden" }`. The account id is always the session's. `AccountBilling` is the orchestrator's body (see `GET /v1/admin/accounts/:accountId/billing`).

| Route | Response |
|---|---|
| `GET /api/billing` | `AccountBilling` |
| `GET /api/billing/standing` | `{ ok, reason: "no_plan"\|"plan_expired"\|"no_balance"\|null, since, until, balanceUsd, warn }` for the header alerts. `ok: false` = channels paused (red alert); `warn` = balance < 1 TR (exactly 1 is fine) or a plan that holds to a set end (`until`) within 3 days (yellow alert). One orchestrator call, cached 5 s per account in memory |
| `POST /api/billing/checkout` `{ kind: "plan"\|"credits", amountUsd? }` | `{ url }` of a Polar checkout (`external_customer_id` = user id, `customer_email`, `success_url` = `<panel>/billing?checkout=success`; `amountUsd` (whole USD, 1..10000) goes to Polar as `amount` cents for the credits product and only matters for a custom-price product) |
| `POST /api/billing/portal` | `{ url }` of the Polar customer portal (`POST /v1/customer-sessions/`) |

Errors: `503 billing_unavailable` without `POLAR_ACCESS_TOKEN` (or the product id of that `kind`); `502 billing_failed` when Polar refuses or is down; orchestrator failures as everywhere (`502`/`503` with `message`).

Polar: plain `fetch` to `https://sandbox-api.polar.sh` (`POLAR_SERVER=sandbox`, default) or `https://api.polar.sh` (`production`) with `POLAR_ACCESS_TOKEN`; `POLAR_PLAN_PRODUCT_ID`, `POLAR_CREDITS_PRODUCT_ID` pick the product per `kind`.

**Warning mails.** When `GET /api/billing/standing` finds `warn`, it mails the user (ru/en by `locale`; kinds `low-balance`, `plan-ending` of `@repo/mail-templates`, button to `<panel>/billing`) once per period. The claim is a row in admin-api's `account_notices` (`account_id`, `kind` `low_balance`\|`plan_ending`, `period`, `sent_at`; primary key on the first three; migration `0002_account_notices`; rows go with the account). Period = the plan's `until` for `plan_ending`, the UTC month for `low_balance`. No timer: it needs a panel open, which is where the header alert lives anyway.

`GET /api/subscriptions` (staff) takes `?accountId=` too and each item has `accountId` and `accountEmail` (from the local `user` table, `null` when the account is gone); the `PUT /api/subscriptions/:id/channel` link route no longer exists.

### Staff: customers (`/api/accounts`)

The staff "Users" page. All routes `{ admin: true }`; an id that is not a customer (staff or unknown) is `404 { "error": "not_found" }`.

| Route | Response |
|---|---|
| `GET /api/accounts?page&pageSize` | `{ items: [{ id, name, email, emailVerified, createdAt, lastActiveAt, banned, channelsCount }], total }`, oldest first; `lastActiveAt` epoch ms or `null`; `channelsCount` from the orchestrator's channel list (shortcut: one unpaged list grouped in memory) |
| `GET /api/accounts/:id/billing` | the customer's `AccountBilling` (same body as `GET /api/billing` below) |
| `DELETE /api/accounts/:id` | `{ id }`; a running Polar plan is revoked first, then the channels, then the account and sessions; `502` (`billing_failed`) / `502` / `503` leaves the account untouched |
| `POST /api/accounts/:id/ban`, `POST /api/accounts/:id/unban` | `{ id }`; ban drops their sessions and refuses sign-in; their channels keep running |

The inactivity job (`deleteInactiveUsers`, 180 days, daily) and both delete routes share `deleteAccount` in `accounts.service.ts`: a running Polar plan is revoked first (`DELETE /v1/subscriptions/{id}`, only with `POLAR_ACCESS_TOKEN`; the plan comes from the orchestrator's billing route), then the owner's channels are deleted in the orchestrator (orders and `llm_calls` stay there) (`X-Admin-Id` = the actor, `system:inactivity` for the job); if that call fails the account is kept, the error is logged and the next daily run retries.

Mail goes through SMTP (`nodemailer`; `SMTP_HOST` `smtp.gmail.com`, `SMTP_PORT` `465`, `SMTP_USER`, `SMTP_PASS`, `SMTP_FROM` `info@shalotts.site`). Without `SMTP_PASS` the subject and link are only logged. Texts are ru or en by the account's `locale` (other or missing: en).

