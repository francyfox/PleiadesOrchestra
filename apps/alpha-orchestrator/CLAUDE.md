# alpha-orchestrator internals

See root `CLAUDE.md` for monorepo commands, workflow, code style and repo-wide lessons.

## Code layout

Follows the root "Code style" convention (`src/index.ts` composition root with config, DB, retention jobs, `serve`; `src/app.ts` `createApp(deps)`; `src/modules/<name>/`). What is specific here:

- `*.instance.ts` singletons (e.g. `translate.instance.ts`) — only `index.ts` and other `*.instance.ts` import them.
- Test helpers: `database.testing.ts` -> `testDb()`, `http.testing.ts` -> `setupAdminApp()`/`admin()`/`json()`.

Modules: `access`, `active-runs`, `agent-settings`, `agents`, `auth`, `billing`, `blocked-ips`, `channel-directory`, `channels`, `config`, `database`, `decisions`, `english-only`, `goap`, `history`, `http`, `identify`, `messages`, `performance`, `persona`, `plan-runs`, `prices`, `rate-limit`, `reply`, `retention`, `run-binding`, `run-stream`, `security`, `stats`, `streaming`, `subscriptions`, `telegram-whitelist`, `text`, `threads`, `translate`, `usage`, `usage-recorder`, `users`, `visitors`, `widget`, `world-state`.

## Commands

- Dev/run: `bun --cwd apps/alpha-orchestrator run dev` (watch) or `start`; copy `.env.example` to `.env`. Binary: `bun --cwd apps/alpha-orchestrator run build` -> `dist/harness` (`bun build --compile`).
- Seed the Telegram whitelist (one-off): `bun --cwd apps/alpha-orchestrator run import:telegram-whitelist <ids>`.
- DB migrations (drizzle-kit): after editing the schema run `bun --cwd apps/alpha-orchestrator run db:generate --name <name>`. Migrations are applied at startup. Then `bunx biome format --write apps/alpha-orchestrator/drizzle/meta` and `bun --cwd apps/alpha-orchestrator run db:snapshot` (see `drizzle/init.sql` below).
- **`bun build --compile` doesn't embed drizzle migrations** — the Docker image copies `drizzle/` and sets `DATABASE_MIGRATIONS_DIR`.
- Docker: `turbo prune` Dockerfile, Alpine final stage (musl binary + `libstdc++`/`libgcc`), `native` stage for the translator (see Translation).

## GOAP planner

`packages/core/src/goap/` — `plan`, `runPlan`, `createTextAction`, `createDecisionAction`, MCP-backed `ToolSource`. `WorldState` is a flat key→value fact bag; actions declare preconditions/effects; the executor reconciles actual effects against expected ones.

`buildActions` in `modules/goap/goap.service.ts` builds the action catalog once per app instance. `POST /v1/messages` streams `runPlan` as NDJSON (`delta`/`done`/`error`). Design and phase status: `apps/docs/content/en/drafts/goap-actions.md`.

**Only SESSION_FACTS survive between requests** — a failed or completed run keeps only `SESSION_FACTS` (`storeOpen`, `store`, `lastProduct`); only a WAITING run (paused for a browser tool) keeps its full state for `resumeReply`. This prevents stale `webmcp:*:result` facts from poisoning the next message.

**User-facing progress (flow lines)** — `GoapAction.describe(state, phase)` → `RunPlanOptions.onStep` → NDJSON `step` lines `{id, phase: running|done|failed, text}` → `ChatMessage.steps` in the widget. Texts are per tool *intent*, bilingual (`webmcp-steps.ts`, `step-text.ts`, language from `page:lang`), never per site. `streamPlanRun` persists them into `plan_runs.steps` (JSON, `StoredStep`) so they survive a reload.

**Flow requests (admin `/flow`)** — a *request* = chain of `plan_runs` linked by `plan_runs.root_run_id`. `ActiveRuns` holds in-memory events of runs executing now. The BFF (`modules/requests`, `buildRequestView`) merges DB + registry into `RequestView` nodes: `prompt → translate → understand → steps → result` with per-step time, tool args, tool answers, effects, model calls.

**External model servers**: env picks base URL, model, temperature and concurrency per model — `LLM_*` (beta), `FUNCTION_CALL_*` (delta; `FUNCTION_CALL_REASONING_EFFORT=none` for Ollama + Qwen3), `LAYA_*` (gamma; `LAYA_MODEL`). `probeAgents` tries `/health`, and for text/function-call falls back to `{base}/models` (Ollama has no `/health`). Examples in `.env.example`.

**Removal of every item** — `prepareNewMessage` writes `scopeAll` (`scopeFacts`) and binds the catalog (`bindListScope`, also in `prepareResume`): read tool → remover per item (`packages/core` CLAUDE.md). Reply: `replyFromTemplate:removal` (`createRemovalReplyAction`, ru/en/kk, «already empty» from the site's own answer). A `checkout`/`removeFromCart` where no step ran gets an honest «nothing was done» prompt in `replyChunks`, never the bare message.

**`recordCall`** (`packages/core/src/record-call.ts`) is the single reporting path: telemetry line + `llm_calls` row. Four `LlmCallKind` values: `text`, `decision`, `classify`, `translate`. Translate rows use `provider: ctranslate2`, no tokens.

## Delta function-call agent

`apps/delta-function-call` (Qwen3-1.7B, port 8282) writes JSON arguments of WebMCP tool calls. `FunctionCallAgent` in `packages/core/src/function-call-agent.ts` — json_schema-constrained completion, `temperature 0`. Called from `createWebMcpActions({ functionCallAgent })` (`argumentsFor` in `goap/webmcp-actions.ts`).

Pipeline: llm output → `repair-arguments.ts` (fences/`<think>`/trailing commas/closing brackets/type coercion) → `validate-arguments.ts` (required/type/enum/items) → up to 2 correction attempts → `buildArguments` fallback → if still missing required field: step fails (`toolResult:<tool> = false`).

Facts named like a parameter are merged OVER delta's answer (`argumentsFor`). Only string/number facts reach the model (no planner flags); only the last *search* answer is shown. Qwen3 thinking is off (`enable_thinking=false`). The model reads `userMessageEn`; a non-English message without a translation (no translator, or it failed) skips delta — `buildArguments` only.

Delta is always called even if facts already look valid — `search_products` has real filters (`department`, `dietary`, `max_price`) that need NL understanding; filter accuracy is worth the ~1.6 s per call.

Real-stack check: `REAL_STACK=1 bunx playwright test buy-cheese` in `apps/e2e`.

## Intent classification

`classifyMessageIntentDetailed(..., rules: "guarded")` in `prepareNewMessage` (`reply.service.ts`):

1. **Lexical rules** (`message-cues.ts`) for `checkout`/`removeFromCart` only — these are never taken from Laya alone.
2. **Site memory** — `IntentMemory` (`modules/intents`): per-channel naive Bayes on `intent_examples` rows with `status = approved`. Built from `normalizeIntentText`. Silent below 0.85, never for `checkout`/`removeFromCart`.
3. **Laya** on the English translation (not the original; no page/lang) for what rules and memory don't claim. Answers are stored in `intent_examples`: `pending` (decide nothing until an admin approves/rejects/corrects in `/intents`), or, when the CALIBRATED confidence (`withCalibration` in `index.ts`, table `LAYA_CALIBRATION` in core) is >= `LAYA_AUTO_APPROVE_CONFIDENCE` (default 0.85), `approved` with `approved_by = auto` and the memory rebuilt. `confidence` is kept on the row and on the `classify` ledger row (`llm_calls.confidence`). Never for `checkout`/`removeFromCart`. An admin verdict sets `approved_by = admin`.
4. Fallback: `chat`.

Not a reason to approve: a reached goal only proves the plan was executable, not that the intent was right (the confidence threshold is the only automatic approval). `recordCall` logs each decision as `kind: classify`, `provider` = `laya`/`memory`/`rules`.

**Tool cues** (`tool-cues.ts`) classify intent from the tool NAME (not description). A read/edit tool is `other`; `specialistPenalty` adds cost per qualifier word (`add_recipe_to_cart` loses the tie to `add_to_cart`).

**Named options** (`packages/core/src/goap/specialist.ts`): a message that says one of a tool's string-enum values (`add_recipe_to_cart.recipe = "Weeknight Beef Tacos"`) picks that tool over the plain one. `prepareNewMessage` writes `specialistTool` + the value + `catalogSearched`/`requestParsed` into the state and `preferSpecialist` (also in `prepareResume`) drops that action's cost; no search, no delta for the value.

Eval: `bun run eval:intents` / `bun run eval:tools` in `packages/core` (cases in `src/goap/intent-cases.ts`). The all-rules mode (`rules: "all"`) is the eval default; production uses `"guarded"`.

## Translation (Opus-MT ru→en)

**First thing `prepareNewMessage` does** (before Laya, before beta-text): any message with non-Latin letters is translated to English → `userMessageEn` fact (original `userMessage` stays).

Engine: CTranslate2 + SentencePiece via `bun:ffi` (`apps/alpha-orchestrator/native/translator.cpp`, `libtranslator.so`). ~30–60 ms on 4 threads (int8). Built with `native/build.sh` (SentencePiece v0.2.0 + CTranslate2 v4.8.2, CPU-only). **GCC 15 needs `-include cstdint`** and `CMAKE_POLICY_VERSION_MINIMUM=3.5`. Alpine `native` stage in Dockerfile; musl, libs copied to `/opt/translator/lib`. Model: `gaudi/opus-mt-ru-en-ctranslate2` (~150 MB fp16, quantized to int8 at load), downloaded into `alpha-orchestrator-models` volume on first start (`ensureModel`, `.part` files).

`modules/translate/`: `translate.service.ts` (text↔bytes, buffer retry, 500-char limit), `translate-engine.ts` (dlopen + `ensureModel`), `translate.instance.ts` (undefined when `TRANSLATE_LIB_PATH` is empty or load fails — everything still works on the original text).

**Catalog language** (`channels.catalog_language`, default `en`, `catalogLang` fact): `createProductRequestAction` uses the English translation only for `en` catalogs; `extractProductRequestRu` (rules on the original) for `ru`; the shopper's words for any other language.

Known weaknesses: «купить творог» → "buy some cottage", «оформи заказ» → "Order it".

**Laya gets English only** (`modules/english-only`, `withEnglishOnly` wraps the `DecisionAgent` in `index.ts`): any non-Latin string in a decide call (tool descriptions, enum values, a message the upstream translation missed) is translated and cached; non-Latin option keys are sent translated and mapped back. No translation = `UntranslatableError`, the call is not made (intent: words/chat; tool catalog: not registered until the translator is ready; parameter choice: first option).

**Latin words stay as typed** (`translateAroundLatin`, `translate.service.ts`): only the non-Latin runs of a mixed message are translated, each on its own — whole-line translation turned «купи Medium Roast Coffee Beans» into "Media Road Coffee Beans".

## Product request extraction

`extractProductRequest` peels verbs/politeness/containers from the English text (rules, no model). Used only for `en` catalogs + available translation. Uses the rules only when `isSimpleRequest` (≤3 words, or a command verb with no clause words, ≤12 words); otherwise `query` fact is left unset and delta reads the whole English text.

**`SESSION_FACTS` includes `lastProduct`** (first in-stock product of the last successful search). `reuseLastProduct(state)` (intent `addToCart` only) fires when `namesNoProduct` (all words are filler: purchase verbs, politeness, «now/теперь», pronouns, digits — lists `FILLER_EN`/`FILLER_RU` in `product-request.ts`). It copies `product`, `query`, `quantity`, `requestParsed`, `catalogSearched` into initial state so the plan skips search.

## Users, access, channels

`alpha-orchestrator` owns a SQLite DB (`drizzle-orm` + `bun:sqlite`): channels (`accessMode` whitelist/open), chat users (identified or anonymous; anonymous purged after `ANON_RETENTION_HOURS`), last `MESSAGE_RETENTION_PER_USER` (10) messages **per user** (stored but NOT sent to the model — `AGENT_MAX_HISTORY_MESSAGES = 0`; 1B model copies earlier replies after a few exchanges), `llm_calls` ledger (never deleted with messages), GOAP traces (`plan_runs`/`plan_events`).

Access (block > whitelist) decided by the orchestrator, not transports: bot calls `POST /v1/access` first, stays silent on `allowed: false`; `/v1/messages` returns empty 403 for denied users.

Admin routes: `/v1/admin/*` under a separate `ADMIN_API_KEY` + `X-Admin-Id`. Widget routes: `/v1/widget/*` (publishable key + `Origin` allowlist + visitor token, in-memory rate limits). `POST /v1/channels/:slug/identify` (server-to-server, links anonymous visitor to site account).

IPs: blocking by salted hash (`blocked_ips.ip_hash`), plaintext `blocked_ips.ip` (null on legacy rows) and `users.last_ip` for admin display. Anonymous users purged with `ANON_RETENTION_HOURS`; blocks expire.

Channel lookup is `Map`/`Set` (`channel-directory`, `invalidate()` after admin writes). `FixedWindowLimiter` prunes at most once per window. Widget guard does "last seen" writes only after origin/IP checks pass.

## Reply service

`ReplyService.startReply` / `resumeReply` in `modules/reply/reply.service.ts`. `streamPlanRun` (`modules/run-stream`) streams NDJSON + persists steps after the terminal line.

**Several products** («buy A, B, C»): facts `foundItems`/`missingItems` (JSON) make `replyFromTemplate` and `replyChunks` list every added item and the ones not found; the fan-out mechanism is in `packages/core/CLAUDE.md`.

**`replyFromTemplate`** (`modules/goap/goap.service.ts`) — templated reply for a completed purchase: no beta-text call, streamed as one `delta`, cost 1, preconditions `inCart + messageIntent: addToCart`. Language from `page:lang` (ru/en/kk, else message's script).

**`replyChunks`** hands the reply model the outcome: cart addition, newest `webmcp:*:text` answer (≤800 chars), or failed `toolResult:*`. Before this fix beta-text answered «as an AI I can't find apples» even when the site had listed them.

**Widget errors**: three types — `network` (no answer, locks composer), `request` (terminal `error` with `code: "task_failed"` — shown as `s.request` + server's `hint` ≤400 chars, never locks), `failed` (other server fault). A failed task triggers a second `runPlan` with `replyOnly` goal so beta-text explains the failure and passes the site's advice on; the request stays `failed` in admin but the turn ends with a normal `done`.

**History stores raw user text** — `userMessageRaw` (`typedText`: NFC, `\n` line ends, control chars except newline/tab dropped). `createTextAction({ toHistoryText })` → `IncomingMessage.historyText` → agent appends `historyText ?? chunks.join(" ")`. Before this fix multi-line messages were stored flattened.

## Channel persona (reply prompt)

`modules/persona`. The reply system prompt is **always built from parts** (`buildReplyPrompt`): the admin's `instructions` (role text, multi-line, <=2000 chars, every line quoted with `> ` so it stays visibly inside its own section) + persona slots (name, tone, greeting, forbidden topics, hand-off contact, language; one line each) + the fixed rules block (`FIXED_BLOCK`, always last, not editable). No `undefined` prompt: a channel without a row gets `DEFAULT_REPLY_PROMPT` (default persona: name "Альбедо", neutral role/tone, not shop-specific); the orchestrator's text agent uses the same as its built-in prompt, so cli/telegram get it too. `@repo/core`'s own default is a short neutral one.

**Storage = overrides only.** `channel_persona` columns hold what the admin changed; `""` / empty list = standard (`DEFAULT_PERSONA`). `savePersona` also stores a value equal to the default as `""`, so improving a default reaches every channel that never customized that field. `getPersona` = overrides over defaults.

Admin API: `GET/PUT /v1/admin/channels/:id/persona` -> `{ persona (in effect), defaults, prompt, fixed }`; `POST .../persona/preview` takes unsaved values, returns the same shape, writes nothing. The UI never copies the rules: it shows `prompt`, with the `fixed` tail marked read-only.

## MCP catalog (WebMCP)

Sites announce tool catalogs on panel open via `POST /v1/widget/tools`. `mcp_catalogs`: one row per distinct catalog per channel, key = `hashTools` (canonical JSON of name/description/schema, order-independent). Same hash keys `ReplyService`'s in-memory LRU of classified catalogs (32). Widget re-announces on `toolchange` event (debounced 300 ms). Newest 5 versions kept per channel; no TTL (invalidation by content).

Elysia drops body fields not in schema — `inputSchema.required` was once lost here.

## Gotchas

- In `app.handle` tests (root lesson: use `http://localhost/...`), `onAfterResponse` runs after the response is returned (tests need a tick). A request rejected in `onRequest` skips all other hooks.
- `SqliteWorldStateStore` existed and was tested but wasn't wired in `index.ts` until 2026-09-29 — always verify `createApp(...)` in `index.ts`, not just that the dependency type accepts the field.

## `drizzle/init.sql` (first-time setup)

One generated SQL file with the full schema, seed data and the `__drizzle_migrations` rows (so the migrator sees all existing migrations as applied). After every `db:generate`, run `bun run db:snapshot` (`scripts/db-snapshot.ts` → `src/modules/database/database.snapshot.ts`, which runs the real migrator in a temp DB and dumps it). `database.snapshot.test.ts` fails if the committed file is stale. Services keep applying incremental migrations at startup; init.sql is only for provisioning a fresh DB (`sqlite3 db < drizzle/init.sql`).

## Billing (Polar)

`modules/billing`: `POST /v1/billing/polar`, mounted only with `POLAR_WEBHOOK_SECRET`, outside both bearer keys (`isOpenPath`). Signature, replay (`billing_webhooks`) and out-of-order rules: `admin-api.md` ("Polar webhook"). `modules/subscriptions`: admin list and channel link (`/v1/admin/subscriptions`). `modules/prices`: OpenRouter price list (cache a day, failure = no prices) behind the `costUsd` of `/v1/admin/usage`.
