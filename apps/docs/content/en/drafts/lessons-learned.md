---
title: Lessons learned
---

# Lessons Learned

Critical items are duplicated in the root `CLAUDE.md`. This file has the full list including less-critical and historical entries.

## Docker / builds

- **`.dockerignore`: never exclude `bun.lock`** — silently breaks any `bun install` in any Dockerfile in the repo (Docker reports the file missing from build context). Keep `.dockerignore` to `**/node_modules`, `dist`, `.git`, `.idea`, `*.md`.
- **Use `**/node_modules` not `node_modules`** — bare pattern doesn't reliably exclude nested `apps/*/node_modules`. Found 2026-09-23: stale `apps/telegram-bot/node_modules` leaked into a `COPY` step and broke the build.
- **`bun install --frozen-lockfile` validates all workspaces** — any Dockerfile that only copies its own `package.json` breaks as soon as a new workspace is added. Fix: `turbo prune <app> --docker` in every service Dockerfile. Consequence: a container image contains only the workspaces its app depends on.
- **`docker run -e VARNAME` only forwards exported vars** — sourcing a plain `KEY=value` `.env` file doesn't export. Use `set -a; source .env; set +a`.
- **`bun build --compile` doesn't embed drizzle migrations** — copy `drizzle/` into the Docker image; set `DATABASE_MIGRATIONS_DIR`. Verified by running the built image against an empty volume.
- **Relative DB path in `env_file` moves DB off the volume** — `./data/admin.db` inside the container resolves to the container layer, not the mount. Pin container data paths in compose `environment:`, not in `.env`. Bite: `ADMIN_MIGRATIONS_DIR=./drizzle` in `.env` crashes on start inside container (`Can't find meta/_journal.json`).
- **<code>{'${VAR:?msg}'}</code> in `compose.yml` evaluates for ALL services** including inactive profiles. Use <code>{'${VAR:-}'}</code> for opt-in services and let the app refuse to start instead.
- **`.dockerignore: *.md` breaks Python `pyproject.toml`** if it declares `readme = "README.md"`. Re-include with `!apps/gemini-webapi-mcp/README.md`. Also exclude `**/.venv`, `**/__pycache__`. Pinned `ghcr.io/astral-sh/uv:<x.y.z>-python3.12-*` images are Debian trixie — pair with `python:3.12-slim-trixie`.
- **`curl --retry N` doesn't resume mid-transfer** — a connection reset during a large download isn't retried, and retry restarts from byte 0. Use `-C - --retry-all-errors --retry 10` for large downloads.
- **`llama-server` logs everything to stderr** — including INFO lines. Railway (and most log viewers) classify by stream, so everything shows as error. Append `2>&1` in the entrypoint.
- **`N_GPU_LAYERS=0 docker compose up beta-text` doesn't reach the container** — compose only interpolates host env into <code>{'${...}'}</code> in `compose.yml`, and `beta-text` takes its env from `env_file`. Use a separate `docker run ... -ngl 0` for CPU comparison.
- **GCC 15 needs `-include cstdint`** for CTranslate2/SentencePiece and `CMAKE_POLICY_VERSION_MINIMUM=3.5` for SentencePiece.

## Bun

- **`bun test` sets `NODE_ENV=test`** — consola lowers its default log level in test environments; `createConsola()` drops `.info()` silently. Pass `level: LogLevels.info` explicitly.
- **Don't name `.env` vars like OS vars** — `TEMP=0.3` made Bun write caches to `./0.3/` (136 MB). Root `.env` also has `PORT`, `THREADS` — every `bun`/`bunx` run from the repo root will see them.
- **`bun --cwd <dir> <script>` ignores `--cwd` for some subcommands** (`bun --cwd apps/admin add …` → "Script not found"). Use `cd <dir> && bun ...`.
- **In zsh `echo == x` fails** — `==` is an expansion. Quote it.
- **`npx @sveltejs/mcp …` fails on the repo's `devEngines`** (bun only). Use `bunx @sveltejs/mcp svelte-autofixer <file>`.
- **zsh: never name loop variables `path`** — it shadows `$PATH` and kills command lookup (e.g., `for path in …`). Use `route`, `p`, etc.

## Elysia

- **Auth must go in `onRequest`, not `onBeforeHandle`** — body schema validation runs before `onBeforeHandle`, so a malformed body returns 422 before auth. `onRequest` runs pre-routing; exempt `/health` by pathname check.
- **`onBeforeHandle` only applies to routes declared after it** — `/health` stays exempt from a later auth hook just by being declared first.
- **`t.Optional(t.UnionEnum([...]))` fills the first value** — it doesn't leave the field `undefined`. Use `t.Optional(t.Union([t.Literal(...),...]))` or the repo's `oneOf()`. A `TLiteral[]` union also breaks Eden body typing.
- **Elysia drops body fields not in schema** — `POST /v1/widget/tools` once lost `required` from every tool's `inputSchema`. Add every field you need to `t.Object`.
- **`app.handle(new Request("http://x/path"))` 404s** — Elysia slices the path at a fixed host-length offset. Use `http://localhost/...` in tests. `onAfterResponse` runs after the response is returned (tests need a tick before asserting on logs). A request rejected in `onRequest` skips all other hooks.
- **Elysia auto-decodes dynamic path params** — don't add manual `decodeURIComponent()` on top.
- **A WS upgrade is a GET** — the CSRF `Origin` guard (state-changing methods only) never sees it. Check `Origin` on the WebSocket route handler itself.
- **Elysia sends a `message` handler's return value to the client** — never `return ws.send(...)`.
- **`onAfterResponse` on a `.ws()` route is typed to the route's response schema** — can't return a 403 there.
- **A fake `fetch` typed `typeof fetch` fails type-checks under Bun** — use a narrow `FetchLike` type in tests.

## Logging

- **Don't use `pino` for low-volume apps** — it's built for high-throughput batched writes; single-argument form silently ignores a plain `{ write() }` destination; `pino-pretty` alone pulls in ~25 transitive packages. Use `consola` instead.

## TypeScript / `apps/admin`

- **`apps/admin` needs TypeScript 6** — two TS versions cause Bun to link two copies of `elysia`; Eden's `Treaty` rejects an `App` from the other copy ("types have separate declarations of a private property").
- **`queryOptions` is exported by `@tanstack/svelte-query`, not `@tanstack/query-core`** — pure modules imported by bun tests must use `query-core`.
- **TanStack column headers must be functions** — `header: () => $content.x.value`, not strings, or they won't follow a locale switch.
- **Vite `server.proxy` does nothing for `/api`** in `apps/admin` dev — vite-intlayer rewrites `req.url` to `/ru/api/...` before it. Use `vite/dev-api-proxy.ts` (first-in-list plugin, proxies by `req.originalUrl`).
- **`vite dev` may bind only `[::1]`** — pass `--host 0.0.0.0` when testing from another tool; after editing `vite.config.ts` check with `ss -ltnp` that restart didn't leave two servers on the same port.
- **Error 200 in `apps/admin` dev = client-side error** — vite-intlayer sends one `full-reload` per dictionary file; 18–46 reloads/second caused route modules to fail mid-reload. Fixed by `vite/coalesce-intlayer-reloads.ts`.

## AI / model integration

- **IronClaw doesn't work with small local models** — ~15k token system prompt + 30s timeout. Don't try again.
- **`createOpenAICompatible` needs `includeUsage: true`** — otherwise streamed token counts are `undefined` (it must send `stream_options: { include_usage: true }` to llama-server).
- **Laya can't load in `llama-server`** — different GGUF format (built by `ggmlc`). Run via `@receptron/laya` / `onnxruntime-node` in a glibc sidecar. Don't conflate with a chat LLM.
- **`@bunli/core` has no default/root command** — `findCommand()` requires an exact positional match; bare `albedo -m "text"` doesn't work.

## GOAP / orchestrator

- **`SqliteWorldStateStore` was not wired in `index.ts`** — production ran on `InMemoryWorldStateStore` for months. A component existing and being tested ≠ wired into the entrypoint. Check `createApp(...)` in `index.ts`.
- **Failed GOAP run must not keep full WorldState as checkpoint** — stale `webmcp:*:result = "error"` infected the next message (11 replans seen in `plan_runs`). Only a WAITING run keeps its full state; every other end keeps just `SESSION_FACTS`.
- **Elysia drops body fields not in schema** — already listed above; critical here because `required` field loss means the planner never sees mandatory parameters.
- **Intent cues: `\b` doesn't work for Cyrillic** — use `(?<![\p{L}\p{N}])`, and `\w` is ASCII-only — use `\p{L}`.
- **Delta: facts named like a parameter are merged OVER delta's answer** — grounding can overwrite a good answer with an empty fact. Only string/number facts are passed to the model.

## Infrastructure / deployment

- **Railway `service delete` doesn't delete attached volumes** — orphaned volumes must be deleted separately with `railway volume delete -v <name>`.
- **`railway.toml`, `prod.test.ts` smoke tests, and VictoriaMetrics reporter deleted 2026-09-23** — Railway dropped in favor of local-only deployment.
- **Renamed services 2026-09-23**: `apps/harness` → `apps/alpha-orchestrator`, `apps/albedo` → `apps/beta-text`, `apps/laya-api` → `apps/gamma-decision`. Compose volumes renamed (one-time model re-download on first up). Didn't rename: env var names, `harness-client.ts` filenames, `albedo` CLI bin, persona names in prose/prompts.
- **`/proc`/`/sys` are the host's** — Docker doesn't namespace them. No privileged sidecar needed for host metrics.
- **CSRF: `localhost` ≠ `127.0.0.1`** — both must be in `ADMIN_TRUSTED_ORIGINS` (and `BETTER_AUTH_URL`).
- **Admin panel on another port/host** means extending `ADMIN_TRUSTED_ORIGINS`.

- **WebMCP polyfill `message` bridge must check `event.origin`** — it used to run any window's `WEBMCP_EXECUTE_TOOL_REQUEST` and reply with `"*"` (audit-2026-10 §1). Now the provider role is off unless `<pleiades-chat expose-tools-to="https://a,https://b">` lists the asker; replies go to `event.origin`; the consuming side only asks/accepts the `allow="tools"` iframe / `fromOrigins` origins. A playground whose *child* iframe hosts the tools needs `expose-tools-to=<playground origin>` on that child's widget.
- **Translation runs in a Worker pool, not on the main thread** — `tr_translate` (bun:ffi, 30–60 ms) blocked the event loop. `translate-pool.ts` + `translate.worker.ts`; `TRANSLATE_WORKERS` (1–2). In `bun build --compile` the worker file must be an extra entrypoint (`bun build ./src/index.ts ./src/modules/translate/translate.worker.ts --compile`, also in the Dockerfile), else `new Worker(new URL(...))` looks for it on disk. And resolve it from `Bun.main`, not `import.meta.url`: inside the binary `import.meta.url` of every module is the binary (`/$bunfs/root/<name>`), so `new URL("./translate.worker.ts", import.meta.url)` points at `/$bunfs/root/translate.worker.ts` while the entry is embedded at `/$bunfs/root/modules/translate/translate.worker.ts` (relative to the common root of the entrypoints) → `ModuleNotFound`, translator silently off (2026-10-15). The embedded name also depends on the Bun version: the image's Bun 1.3 embeds `translate.worker.js` only (1.4 accepts `.ts` too). `workerEntryUrl` in `translate-pool.ts` picks `.js` under `/$bunfs/`, `.ts` from source.
- **`expect(promise).rejects` hangs while a Worker must answer** (bun test 1.4) — it waits without servicing worker messages, so the call looks stuck until the pool's timeout. In worker tests catch the rejection with try/catch and assert on the error.
- **Private workspace code in the published widget must be a `devDependency`** — `@repo/webmcp-polyfill` is `workspace:*` under the widget's `devDependencies`, so Vite inlines it into the IIFE and npm/JSR consumers never see an unpublished package. Moving it to `dependencies` would ship an unresolvable import. After a build: `grep -c "@repo" packages/pleiades-widget/dist/*.js dist-jsr/*.js` must be 0. The widget CI job now also runs the polyfill's own types/lint/tests, since `bun run test` in the widget no longer covers them.

## admin-api: better-auth trusts X-Forwarded-For by default

`auth.api.*` called from our own routes skips better-auth's HTTP rate limiter, and its `session.ipAddress` is read from `x-forwarded-for` unless `advanced.ipAddress.ipAddressHeaders` says otherwise — a client can spoof it. Fix: resolve the IP ourselves (`CLIENT_IP_SOURCE`, default `socket`), pass better-auth a copy of the headers with the client IP headers removed and `x-admin-client-ip` set, and configure `ipAddressHeaders: ["x-admin-client-ip"]`. Login throttling lives in `modules/login-throttle`.

## Widget body caps: Content-Length check is a pre-filter, Bun's `maxRequestBodySize` is the backstop

`/v1/widget/*` rejects `Content-Length > WIDGET_MAX_BODY_BYTES` in `onRequest` (before body parsing); chunked bodies carry no length, so the server-wide `HTTP_MAX_BODY_BYTES` (passed through `serve({ maxRequestBodySize })` to `app.listen`) is what stops them. Elysia's `onRequest` is global even inside a prefixed plugin, hence the explicit path check. In tests `new Request(url, { body })` sets no `content-length` header: set it by hand. `tool-results` is checked by `callId` (= id of the run that issued the `tool_call`) and `awaitedTool`, both stored in the WAITING checkpoint; the resume drops `awaitedTool`, so a replay of the same answer is refused.

- **Drizzle `.set()` rejects `sql.placeholder()` directly in prepared updates** — wrap it in a `sql` template, see the snippet below. Prepared statements live in `database/prepared.ts` (cached per `Db`); `touchVisitor` is coalesced to one write per `TOUCH_COALESCE_MS` (60 s) unless the IP changed.

  ```ts
  lastSeenAt: sql`${sql.placeholder("now")}`
  ```

## Persona and delta prompt (2026-10-14)

- The shared delta prompt must name no kind of shop or product; a test greps it for shop/grocery words (`\brice\b`, not `rice`, which matches "price"). Site-specific examples belong to the per-site catalog profile (audit 7.2), not to the shared prompt. `apps/benchmark` (tools) sends exactly core's messages (`functionCallMessages`, PO-25).
- **Delta only works in English.** Russian exists only at the input (translator, reply model); every other model reads `userMessageEn`. An untranslated non-English message skips delta (`argumentsFor`, `buildArguments` only): hiding the request behind the facts still gave 10% on Russian cases. The benchmark has English cases only.
- Channel persona only fills its own slots of the reply prompt: each value is flattened to one line (control chars and newlines removed) and capped, and the fixed rules come last and say the persona is style only. The reply action reads `channelId` from the world state; the prompt itself is cached in `ChannelDirectory` (`replyPrompt`, refreshed by `invalidate()`), never stored as a fact.

- **GOAP planner (`packages/core/src/goap/plan.ts`) is uniform-cost with no heuristic** — a synthetic catalog with many equal-cost alternatives explodes (100 actions: 25 ms, 143: 360 ms for the old planner, 27 ms for the heap/bitset one). Bench catalogs must stay sparse or `bun run bench:plan` won't finish. The old implementation lives in `plan-reference.ts` only for equivalence tests/bench; heap ties are FIFO to keep the old tie-breaking. `git mv` stages — use plain `mv` when other people's staged changes are in the index.

- **drizzle `init.sql` (PO-36) must mimic the bun-sqlite migrator exactly (drizzle-orm 0.45).** `__drizzle_migrations` is `(id SERIAL PRIMARY KEY, hash text, created_at numeric)` — `SERIAL` is not an INTEGER PRIMARY KEY alias, so `id` is NULL in every row. `hash` = sha256 hex of the whole migration `.sql` file text; `created_at` = journal `when`. The migrator only compares the *last* row's `created_at` (max) against each journal `when` — hashes are never checked — so a DB from `init.sql` is a no-op, and a later migration (greater `when`) applies on top. Migrations can seed data (`0001_seed_channels`), so the dump includes all table rows, not just schema. Regenerate with `bun run db:snapshot` after every `db:generate`.

## Models through the AI SDK (2026-10-15)

- **Every HTTP model call goes through the Vercel AI SDK** — chat (`createOpenAICompatible` + `streamText`), delta (`createFunctionCallModel` + `fillOnce`: `generateText` with `Output.object`), Laya (`createDecisionAgent`: `experimental_decide` with `@ai-sdk/typesafe-ai`). `ai`, `@ai-sdk/openai-compatible`, `@ai-sdk/typesafe-ai` are pinned **exactly** in the root catalog: decision models are `experimental_*` and may change in patch releases.
- **Laya speaks TypeSafe Jev.** `@ai-sdk/typesafe-ai` posts `{baseURL}/systemone` and parses exactly what `laya.systemOne()` returns, so gamma-decision serves `POST /v1/systemone` (the old `/v1/decide` is gone) and `createDecisionAgent` appends `/v1` to `LAYA_API_BASE_URL`. Answers are SDK-shaped: `boolean` with `probability` (was `noul`). SDK overhead measured at ~1 ms per call (32.5 vs 31.4 ms p50 on GPU).
- **`fillOnce` must return the raw text even when the object fails validation** — the repair → ground → validate → correction loop works on text; take it from `NoObjectGeneratedError.text`. `allowSystemInMessages: true` is needed for a system message in `messages`.
- **openai-compatible extra body fields**: `providerOptions[<provider name>]` is spread into the body, except keys the provider models itself — `reasoning_effort` is overwritten by `reasoningEffort`, so pass `{ reasoningEffort: "none" }`.
- **Qwen3 on Ollama thinks unless told not to** — Ollama ignores `chat_template_kwargs`; without `reasoning_effort: "none"` it spent ~1100 tokens thinking and returned `{}`. Even with it, it sometimes "thinks" inside a JSON string (`</think># Final Answer…`): the benchmark caps answers at 48 tokens (field choice) / 128 (one field) so a runaway answer fails fast instead of taking 5 s.
- **onnxruntime-node and CUDA**: 1.30's CUDA EP needs CUDA 13 (`libcublasLt.so.13`), i.e. driver ≥ 580. On driver 550 (CUDA 12.4) pin `onnxruntime-node` 1.23.2 (1.22.0's install script looks for a `win-x64` path on Linux). Install with `ONNXRUNTIME_NODE_INSTALL=cuda12` on `nvidia/cuda:12.x-cudnn-runtime`; Laya then takes ~2.2 GB VRAM and answers in ~30 ms vs ~450 ms on 4 CPU threads.
- **Building a 7 GB CUDA image on a small root disk filled it to 100%** and restarted the neighbours' Postgres. Check `df -h /` first and `docker builder prune -af` right after the build.

## A tool error that names the missing step (2026-10-15)

- Trace `gemini_tomatoes`: `add_recipe_to_cart` answered "No store is open yet. Call choose_store first with one of: …" while the session fact `storeOpen: true` was stale; the run only failed (the big model fixed it by hand). Now `recoveryFromToolError` (`packages/core/src/goap/tool-error-recovery.ts`) reads the stored error text (`webmcp:<tool>:text`), finds another available tool named in it, sets that tool's intent effects to false and clears its `toolResult:`/`webmcp:*:result`; the planner then runs it (its enum parameter still goes through the Laya choice step) and repeats the failed call. Tools whose intent promises no facts are not recoverable (the planner cannot route to them).
- **Loop guard lives in the state, not the executor**: `maxActionFailures` is per `runPlan` and every browser round trip resumes in a new one, so a recovery that does not fix the error would repeat forever. `recovery:<tool>` stores the error text already recovered from; the same text again fails the step as before (then the `replyOnly` failure reply). It is not a session fact, so it dies with the request.

## A message that names a tool's option (2026-10-15)

- **«купи ингредиенты для Weeknight Beef Tacos» bought Ground Beef.** `add_recipe_to_cart { recipe: enum }` never won: `specialistPenalty` makes a specialist costlier than `add_to_cart`, the cost is static (actions are built once per catalog), and `add_to_cart` needs search + parsed request. Fix (`goap/specialist.ts`): a tool action has `bindToRequest(state)`; when the message (`userMessage` or `userMessageEn`) says one of the tool's string-enum values as whole words (case/punctuation-insensitive, value >= 6 normalized chars so "2D"/"hot" never match; longest wins) and `messageIntent` equals the tool's intent, `prepareNewMessage` writes FACTS into the request state — `specialistTool`, the parameter value, its `param:` choice flag, `catalogSearched`, `requestParsed` (the `reuseLastProduct` trick) — and `preferSpecialist` gives that action cost 0.1 on a per-request copy. The preference is rebuilt from `specialistTool` in `prepareResume`: the checkpoint keeps the fact. Planning a cost from the message instead would have broken resume (the plain tool would win after the pause).
- Open: a single common-word enum value of 6+ letters ("Standard", "Delivery") still matches as a phrase; there is no check against the rest of the message.

## Several products in one message (2026-10-15)

- **«купи Honeycrisp Apples, Oat Milk» searched for one product named "Honeycrisp Apples, Oat Milk"** and failed. The big model (trace `gemini_buy_few_products`) searched each item and added all in one `add_to_cart {items:[…]}`. Now code does it (`product-request.ts` splitting, `shopping-list.ts`, `fan-out.ts`), no model involved.
- **A WorldState holds primitives, a waiting action could not write facts.** A run that pauses (`waiting`) keeps `nextState` as of before the action, so a cursor through several calls of one tool had nowhere to live. `ActionResult.waiting` now carries optional `facts`, merged into the checkpoint by the executor. The cursor (`fanOut:<tool>`) stays PAST the end after the last item: a replan after a failed search re-reads the same stale answer and must end the same way, not ask the browser again.
- **Fact names must not equal tool parameter names**: `buildArguments` copies a fact into the parameter of the same name, and the add tool's list parameter is called `items` — so the lists are `requestedItems`/`foundItems`/`missingItems`, never `items`.
- **Splitting rule (conservative, English and Russian)**: `,`/`;` always (not a decimal comma); a comma list ends at its last «and»; bare «A and B» splits only when each side is <= 2 words or the second side starts with a count; `FIXED_PAIRS` («mac and cheese», «salt and pepper») and `&` never split. Known misses: a brand/product that is two short words around «and» and not in `FIXED_PAIRS` is split; a comma inside a product name («wireless mouse, black») makes two items; `parseProductRequest` (long messages via the text model, other catalog languages) is not list-aware.
- The add tool's list parameter is recognised from the schema alone (`findListParameter`: array of objects with a string field — required one preferred — and an integer/number field), so `lines:[{title,count}]` works like `items:[{product,quantity}]`; the same fill now serves a single found product.

## «Remove everything from the cart»: no_plan, then an invented «the cart is empty» (2026-10-15)

- **`goalForIntent` checked only the fact's key, not its value.** The goal `inCart: false` looked reachable because `add_to_cart` produces `inCart: true`; the planner found no path (`no_plan`), the run fell into the `replyOnly` explanation, and the reply model, which had seen nothing of the site, wrote «the cart is empty». The pair key+value is checked now: no tool that removes means the goal degrades to the reply.
- **`update_cart_item` (a site tool, «0 removes it») was `other`:** its name says «update». `removeFromCart` is now also read from the schema (a numeric parameter whose description says 0 removes/deletes), not only from names.
- **An action on every item of a list is the same fan-out as «buy A, B, C»,** only the list comes from the answer of a reading tool (`get_cart`/`list_*`/`view_*`, new tool role `readState`) instead of the message. Not a «clear cart» special case.
- **`readState` is never offered to Laya**, neither for a tool nor for a message: a sixth description line only gives the 1B classifier one more way to be wrong (eval before/after: intents 63/63 and 50/51, tools 11/11).
- **For `checkout`/`removeFromCart` with no step run, the reply model must not describe the site:** `replyChunks` tells it nothing was done. Other intents without tools (search, addToCart…) are not covered (a wrong classification of plain chat is likelier there) - open question.

## Laya cut every intent option to ~13 tokens (2026-10-15)

- **Laya shares ONE budget (`head_max_len` = 192 tokens, English checkpoint) between the instructions and all options of a `choice` question.** The message-intent question (chat + 11 intents with examples in two languages) was 418 tokens of options: `buildSequence` silently cut each option to an equal share, so all examples were lost and the instructions were cut to "...when unsure, pick". From 11 options on, probabilities also use temperature 0.1 (`temperature_by_options["choice:11+"]`) and saturate (~1.00 when wrong).
- **Fix: choose in rounds** (`choice-rounds.ts`). ≤10 options and ≤192 estimated tokens per question; the winner of a round is the last option of the next. Descriptions in `intent-taxonomy.ts` are short, English only. A question that fits stays one call; the intent questions (12 and 11 options) take 2 calls.
- **Token estimate = chars / 3.** Measured against the real tokenizer on the rendered options: 3.3-4.7 chars/token (camelCase keys lowest), 4.2 average; 3 keeps a margin. Core has no tokenizer.
- **Measured (Laya alone, English cases of INTENT_CASES + INTENT_HOLDOUT, 46):** one call with the old long descriptions 26/46, one call with short ones 29/46, rounds 39-41/46. Winner first vs last, chat first/last/middle, 10 vs 6 options per round: all within 2 cases (noise), so the simple order is kept (chat first, winner last, 10). 6 per round costs a third call for no clear gain.
- Russian eval messages must be translated before Laya (the pipeline does that); `eval/intents.ts` sending Russian raw makes "Laya alone" numbers meaningless for `ru`.

## Russian still reached Laya (2026-10-15)

- **Laya reads English only, but three paths sent it whatever they had:** message intent fell back to the untranslated text (`english ?? message`) when the translator was off or failed; tool classification sent the site's tool name/description as is; parameter choice sent `userMessage` (not `userMessageEn`) and the enum values of a Russian catalog as option names. `eval/intents.ts` sent Russian cases raw, so "Laya alone" ru numbers (16/41) said nothing about production.
- **Fix: one wrapper around the port, `withEnglishOnly(decisionAgent, { translate })`** (`alpha-orchestrator/src/modules/english-only/`), wired in `index.ts`. Every non-Latin string in the state, instructions and criteria is translated (`translateAroundLatin`, LRU cache of static strings); non-Latin criteria KEYS are sent translated (descriptions are often `null`, an id like `o1` would give Laya nothing to read) and the answer and its probabilities are mapped back to the original keys. If a string cannot be translated the call is refused with `UntranslatableError` (core), never sent. Fallbacks: message intent -> words/chat (`fallback`), tool catalog -> not registered until the translator is ready (not cached as `other`), parameter choice -> first option.
- **Eval:** Russian cases go with a hand-written English rendering (`intent-cases-en.ts`; no native translator on the eval host) and the run aborts if a non-Latin character reaches Laya. Laya alone, same descriptions as that day's tree: INTENT_CASES 44/67 (ru 26/41, en 18/26; was 31/67), HOLDOUT 29/51; as shipped 67/67 and 50/51 unchanged. A real Opus-MT is a little worse than the hand rendering, so these are upper bounds.
- Not covered: Latin-script non-English text (German, Turkish) is treated as English.

## Laya's confidence recalibrated on our data; 0.85 auto-approves intents (2026-10-15)

- **Shipped temperatures are not ours.** Laya returns softmax(z / T) with one T per question type x option count (`laya_config.json`). We refit ONE T per bucket (`bun run calibrate` in `packages/core`, NLL by golden-section on log T, 5-fold; table in `src/laya-calibration.ts`) and apply it client-side without logits: p' = softmax(ln p * Tship / Tnew) (`laya-calibrate.ts`, `withCalibration` around the decision agent in `index.ts`, innermost, under `withEnglishOnly`). A temperature cannot move the argmax, so answers and the 67/67, 50/51 evals are unchanged; only the confidence changes. Probabilities are rounded to 4 decimals by Laya: p = 0 is floored at 1e-4.
- **Data (raw probabilities saved once, fitting is offline):** `eval/data/laya-intents.json` (93: INTENT_CASES + INTENT_HOLDOUT minus the words-only intents, asked exactly as production, English text) from `bun eval/collect-intents.ts`; `eval/data/laya-choices.json` (87 decisions: 49 enum + 38 boolean) from `bun laya --samples` in `apps/benchmark`. `intent_examples` of the running orchestrator: 69 rows, 66 pending, 3 approved - no labels worth fitting. Refit after real approved/corrected rows exist.
- **Held-out (5-fold) result:** choice:6-10 (n=95, acc 81%): T 1.00 -> 1.19, ECE 0.073 -> 0.048, mean confidence 84% -> 79%. choice:3-5 (n=47, acc 72%): T 1.76 -> 1.22, ECE 0.095 -> 0.076, confidence 65% -> 73% (Laya was UNDER-confident there). noul:2 (n=38): the refit (1.98 -> 2.36) made held-out ECE worse (0.069 -> 0.102): shipped temperature kept (the script keeps shipped when the refit does not lower held-out ECE or n < 30). choice:2: no data (every benchmark enum has >= 3 options with "(not said)"), shipped kept. Far from the authors' 0.466 -> 0.081 because the shipped values are already near-fine on our questions; the sets are small and grocery-heavy.
- **>= 0.85 on the intent question (Laya alone, the path that fills `intent_examples`):** shipped probabilities 61 of 93 answers, 56 right (92%); calibrated 52, 48 right (92%, in-sample T). Calibration trims coverage, not precision. Wrong ones above 0.85: «cheaper than 3 dollars» -> compare (want filter), «how much is two plus two?» -> compare (0.97, want chat), «I will order in Penny Pantry» -> addToCart (want chooseStore), «previous page» -> navigate (want paginate). At 0.95: 27 answers, 26 right (96%). So ~8% of auto-approved labels would be wrong at 0.85 on this (deliberately hard) set; the default stays 0.85 (the authors' start) but `LAYA_AUTO_APPROVE_CONFIDENCE=0.95` is the safer value until real traffic is measured. Auto-approved rows are marked `approved_by = auto` + `confidence` and an admin can reject/correct them in /intents.
- **checkout/removeFromCart are never auto-approved** (`NEEDS_THE_WORDS` guard in `learnIntent`, although Laya is never offered them). Routing is unchanged: a confident answer only changes what is stored (and memory is rebuilt), not the turn.
- The confidence is also on the `classify` call: `llm_calls.confidence` and `llm.confidence` in the telemetry line.

## `docs/` moved into the docs site as English drafts (2026-10-19)

- The design notes, contracts, plans, the audit and this file moved from `docs/` to `apps/docs/content/en/drafts/` (site `/docs/drafts/`), translated to English, so GitHub issues can link a page with an anchor. Images (`cover.png`, `covers/`, `logo.svg`) and the raw traces (`trace/`) stay in `docs/`.
- **SveltePress compiles Markdown as Svelte**: inline code becomes a template literal with only `\` and backticks escaped, so a dollar sign followed by a brace inside inline code is interpolated and fails the build ("Unexpected token"). HTML entities do not help (remark decodes them back). Write it as a Svelte string expression in a `code` tag, see the compose lessons above. An unknown fence language (`toml`) also fails the build until it is added to `highlighter.languages`.

## Agent settings in the DB over env (2026-10-19)

- **Agents are no longer module-level singletons built from `config`.** `agents.instance.ts` and `function-calls.instance.ts` build from `agentSettings.effective(id)` through `agentSettings.track(build)` and rebuild on every admin save; the exported `agent` / `productRequestAgent` / `functionCallAgent` are thin delegates, so a run in progress keeps the instance it started with. Limiters and the history store are created once and survive a rebuild. `GET /v1/admin/agents` takes `specs` as a function for the same reason.
- **WebCrypto decrypts asynchronously, agents are built synchronously**: `effective()` answers from a cache that `refresh()` fills (startup top-level await in `agent-settings.instance.ts`, and after each save).
- **The env API key must not follow a changed base URL**: an override of `baseUrl` without a picked provider key sends no key, otherwise pointing an agent at a third-party host would leak the local server's key.
- Changing or losing `PROVIDER_KEYS_SECRET` makes stored provider keys unreadable (the keys must be entered again). `llm_calls.provider` is now the provider key's name when one is picked.

## Providers file instead of a free base URL (2026-10-20)

- **Architecture change**: an agent no longer has `source`/`baseUrl`/`providerKey` overrides. It picks a `provider` from `apps/alpha-orchestrator/configs/providers.toml` (Crush-like, edited on the admin panel's Models tab) plus a model; the provider's key is the stored provider key of the same id. Migrations 0016/0017 drop the old columns (no data was saved yet).
- **The file holds no keys**: `api_key` in it is refused, so a config edited from the panel and bind-mounted from the repo can't leak one. `providers.toml` is gitignored; the example is tracked.
- **drizzle-kit asks "rename or create?"** when one migration drops columns and adds another; without a TTY it fails. Split it: generate the drops first, then the new column.

## Model parameters and keys move into providers.toml (2026-10-20)

- **Architecture change**: temperature, reasoning effort and extra request fields belong to a model in `providers.toml`, not to an agent or env (`LLM_TEMPERATURE` for the orchestrator, `FUNCTION_CALL_TEMPERATURE`, `FUNCTION_CALL_REASONING_EFFORT` removed; `LLM_TEMPERATURE` still feeds beta-text's llama-server). An agent only picks provider + model. The encrypted `provider_keys` table and `PROVIDER_KEYS_SECRET` are gone (migration 0018): keys are an `api_key` of the provider.
- **A file with keys**: written 0600, gitignored, and **dockerignored** — the Dockerfiles copy the pruned app source, so without the ignore a local `providers.toml` would be baked into an image layer. The API masks keys; the editor's masked key saved back means "keep".
- **Bun parses TOML but can't write it**: `stringifyProviders` writes our shape (JSON strings are valid TOML basic strings); comments of a hand-edited file are lost on the next save.

## Floating `oven/bun:1` tag ran a different Bun than tests (2026-10-20)

- The Dockerfiles used `oven/bun:1-alpine`; the cached image was Bun 1.3.14 while local and CI ran 1.4.3. `Bun.TOML.parse` errors differ between them (1.3: `BuildMessage: Unexpected end of file`; 1.4: `SyntaxError: TOML Parse error: …`), so the providers check found the error line in tests but not in the container. All Dockerfiles now pin `oven/bun:1.4.3(-alpine)`, the same as CI's `bun-version`; bump them together.
- Neither version puts the TOML position on the error (`line`/`column` are the JS call site); the check finds the line by re-parsing prefixes.

## WordPress plugin MVP (2026-10-19)

- **The widget installs the WebMCP polyfill at mount, not at script load.** A page registering its own tools cannot count on `document.modelContext`. The widget now dispatches `pleiades:webmcp-ready` on `document` right after installing it; the plugin registers at once if the API exists, else on that event. Verified in a real browser.
- **`docker compose up` with `COMPOSE_PROFILES=wordpress` still starts every service without a profile** (alpha-orchestrator, admin-api) and needs their `${VAR:?}` values. Moved WordPress to its own `compose.wp.yml` (project `pleiades-wordpress`) so it never starts the main stack.
- **`wordpress:6-*` is too old for the current WooCommerce** (needs WP 7.0): use the `wordpress:php8.3-apache` tag.
- **WooCommerce's `sample_products.csv` imported through WP-CLI creates no posts** (it reports 25 imported; the IDs in the file point nowhere). Use `sample_products.xml` with `wordpress-importer`, then `wc tool run regenerate_product_lookup_tables` (price filters read that table) and delete the `wc_products_onsale` transient (`on_sale=true` returned nothing until then).
- **Store API specifics the tools depend on**: `min_price`/`max_price` are in minor units; add-item `variation` is a list of `{attribute, value}` where `attribute` is the product attribute's name exactly as `get_product` shows it (case-sensitive: `color`, not `Color`); `category` accepts an id or a slug.
- **The widget drops tool `annotations`** (`listTools` in `lib/webmcp/webmcp.ts` keeps name/description/inputSchema) and the orchestrator does not read them yet: the plugin registers them, but `readOnlyHint` has no effect until both sides pass it on.

## Billing: Polar webhook and spend (2026-10-19)

- **Polar signs two ways.** Endpoints created after 2026-09-08 follow Standard Webhooks (`whsec_` + base64 key, pass the secret as-is to the library); older ones and user-provided secrets sign with the UTF-8 bytes of the whole secret string (the SDK base64-encodes it first). The receiver tries both keys. Not tested against a live Polar delivery: send a test event from the Polar dashboard after setting `POLAR_WEBHOOK_SECRET`.
- **The webhook route is outside both bearer keys** (`isOpenPath` in `auth.service.ts`): Polar cannot send them. Without it every delivery would be a 401. The route is mounted only when the secret is set, so an unconfigured instance answers `404`, not an unauthenticated write path.
- **Raw body**: the signature covers the exact bytes, so the route uses `parse: "text"` and parses JSON itself after the check.
- **Out-of-order events** are decided by the payload's `modified_at` (skip older, equal wins), not by arrival order; the manual `channel_id` is outside the overwrite. `billing_webhooks` grows by a row per delivery and is not pruned (a few rows a month at launch; prune by `received_at` if it ever matters).
- **Spend is an estimate**: today's OpenRouter price applied to past tokens, a model without a price costs 0 (a typo in a paid model name would show as free). Store a price per call (`costUsd`, PO-8) when it matters.


## WordPress: showing cart tool writes without a reload (2026-10-19)

- **A Store API write updates nothing on the page by itself**, in either theme kind. Classic: `wc_fragment_refresh` fixes only the header mini cart; the shortcode cart table needs its markup re-fetched, the checkout needs `update_checkout`. Block: the Cart/Checkout blocks refresh on `invalidateResolutionForStore()` or on the `wc-blocks_*_cart` events; the mini cart block of Twenty Twenty-Five loads lazily and `wp.data` is not on the page, so only the events reach it.
- **The cart page's first `.woocommerce` element is not the cart** (Storefront has several); select it with `:has(.woocommerce-cart-form)`.
- **WooCommerce 11 creates block Cart/Checkout pages**; for a classic theme `setup.sh` rewrites them to shortcodes, and back (delete + `WC_Install::create_pages()`) when switching to a block theme.
- **Browser caches `tools.js`** (`?ver=` was constant): the asset version now includes the file mtimes.

## Users became visitors (2026-10-20)

- **"Users" now means paying accounts**, so the chat people (widget, bot) are **visitors** everywhere: orchestrator table `users` to `visitors` and every `user_id` column/index to `visitor_id` (migration 0019 is a pure rename plus `name`, data survives; drizzle-kit's own diff dropped and re-copied the tables with a SELECT of columns that did not exist yet, so the SQL was written by hand and only the snapshot kept), `/v1/admin/users*` to `/v1/admin/visitors*`, admin-api `/api/users*` to `/api/visitors*`, live topics `users`/`user` to `visitors`/`visitor`, groupBy `user` to `visitor`, panel `/users` to `/visitors`.
- **Wire names that outside code reads stayed**: `userId`/`externalUserId` in `/v1/access`, `/v1/messages` and identify (transports and sites), and `userId` in `@repo/core` types (`CallContext`, `LlmCallRecord`, the `userId` world-state fact). A blanket find-and-replace broke exactly these; the tests caught it. Rename them together with the transports when needed.
- **`visitors.name`** (`adjective_animal_xxxxxx`) is not unique and has no index on purpose: nothing may rely on it, the id is the key. Existing rows are named at startup (`backfillVisitorNames`), the column default `''` only lets the migration add a NOT NULL column.
- **drizzle-kit asks rename-or-create interactively** and refuses without a TTY; drive it through a pty (Down + Enter) or write the SQL by hand.

## Accounts: staff tokens and levels (2026-10-20)

- **Roles are a number on the account, not "earliest account".** `user.level` (0 super admin, 100 admin, 200 user) replaced `superAdminId`; checks are `level <= 100` for staff, `=== 0` for super-only. The better-auth admin plugin's text `role` is now only a side effect (staff `admin`, users `user`) that keeps its ban endpoints working.
- **Staff have no password.** They sign in with a 32-byte token (SHA-256 stored, constant-time compare) through a small better-auth plugin endpoint (`staff-token`) that creates a normal session, so every guard keeps working on one cookie. A migration deletes the credential rows of the existing accounts, and `/api/user/login` refuses staff emails on its own in case such a row ever comes back.
- **A taken email at registration looks like success.** With `requireEmailVerification` better-auth answers the same `200` for a new and an existing address (no account enumeration); the UI says "check your email" in both cases. Do not add an `email_taken` branch: it is dead code.
- **Verification link is a GET on admin-api** (`/api/user/verify`) that redirects to the panel; better-auth's own link would point at `/api/auth/verify-email`, which is not mounted (the API is wrapped, not exposed).
- **`internalAdapter.deleteSessions` takes tokens**, not a user id: use `deleteUserSessions(userId)`. `createUser` needs a second argument (`{ method: "admin" }`) in 1.7.
- **Existing installs**: the migration marks every account staff (earliest = super, the rest = admin) but they have no token yet. The CLI (`admin:create --email <existing>`) issues one. It runs on the host against `ADMIN_DATABASE_PATH` (the Docker image only has the compiled server).


## Channel ownership (2026-10-20)

- **Who sees what is decided only in admin-api.** The orchestrator takes `ownerId` as a plain filter (`channels`, `stats`, `usage`) and trusts `ADMIN_API_KEY`. For a user, admin-api sets the owner from the session on lists and creates and answers 404 `not_found` (not 403) for another owner's channel, checked by listing the owner's channels (no get-by-id upstream). The live hub injects `ownerId` from the session too; a client param is overwritten, other topics are `forbidden`.
- **Deleting an account deletes its channels first.** `deleteAccount` calls the orchestrator and only then removes the row; on failure the account stays and the daily inactivity job retries. The orchestrator side needed no new foreign keys: channel children cascade and `llm_calls`/subscriptions were already `ON DELETE SET NULL`, so money totals survive.
- **Elysia validates the body before the macro guard**, so a bad body on a staff route answers 422 to a user, 403 only for a valid one. No data leaks either way; the route-table walk test accepts 403 or 422 and requires that nearly all are 403. Do not rely on 403 for malformed bodies.
- **Never `git stash` in a dirty tree with staged renames**: `stash pop` brought back the old-named files (`users.*`) and broke type-check; the index is not restored without `--index`.

## Billing architecture (2026-10-21)

- **Subscriptions belong to the account, not the channel.** `subscriptions.account_id`; a channel is served while its owner's account has a plan in effect and a balance above zero.
- **The ledger is micro-USD integers** (`credit_ledger`, append-only, balance = SUM, 1 TR = 1_000_000): no float drift, top-up once per order, refunds as negative rows, usage debits keyed by `llm_calls.id`.
- **Standing is cached in `ChannelDirectory`** and refreshed on the Polar webhook and after a usage flush that debited the account; expiry is computed on read, no timer. Staff channels never suspend.
- **A suspended channel answers `402 channel_suspended`** (widget guard, visitors, `POST /v1/access`); nothing is deleted while suspended.
- **Staff money** (`GET /v1/admin/finance`): `@repo/tax` is applied per order, not to the period total, because the fixed fee is per receipt. Unknown model prices give `null`, never 0; non-USD orders are counted, not converted. `finance` only reaches the dashboard when no `ownerId` is set, so a user's session can't get it.
