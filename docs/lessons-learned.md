# Lessons Learned

Critical items are duplicated in the root `CLAUDE.md`. This file has the full list including less-critical and historical entries.

## Docker / builds

- **`.dockerignore`: never exclude `bun.lock`** — silently breaks any `bun install` in any Dockerfile in the repo (Docker reports the file missing from build context). Keep `.dockerignore` to `**/node_modules`, `dist`, `.git`, `.idea`, `*.md`.
- **Use `**/node_modules` not `node_modules`** — bare pattern doesn't reliably exclude nested `apps/*/node_modules`. Found 2026-09-23: stale `apps/telegram-bot/node_modules` leaked into a `COPY` step and broke the build.
- **`bun install --frozen-lockfile` validates all workspaces** — any Dockerfile that only copies its own `package.json` breaks as soon as a new workspace is added. Fix: `turbo prune <app> --docker` in every service Dockerfile. Consequence: a container image contains only the workspaces its app depends on.
- **`docker run -e VARNAME` only forwards exported vars** — sourcing a plain `KEY=value` `.env` file doesn't export. Use `set -a; source .env; set +a`.
- **`bun build --compile` doesn't embed drizzle migrations** — copy `drizzle/` into the Docker image; set `DATABASE_MIGRATIONS_DIR`. Verified by running the built image against an empty volume.
- **Relative DB path in `env_file` moves DB off the volume** — `./data/admin.db` inside the container resolves to the container layer, not the mount. Pin container data paths in compose `environment:`, not in `.env`. Bite: `ADMIN_MIGRATIONS_DIR=./drizzle` in `.env` crashes on start inside container (`Can't find meta/_journal.json`).
- **`${VAR:?msg}` in `compose.yml` evaluates for ALL services** including inactive profiles. Use `${VAR:-}` for opt-in services and let the app refuse to start instead.
- **`.dockerignore: *.md` breaks Python `pyproject.toml`** if it declares `readme = "README.md"`. Re-include with `!apps/gemini-webapi-mcp/README.md`. Also exclude `**/.venv`, `**/__pycache__`. Pinned `ghcr.io/astral-sh/uv:<x.y.z>-python3.12-*` images are Debian trixie — pair with `python:3.12-slim-trixie`.
- **`curl --retry N` doesn't resume mid-transfer** — a connection reset during a large download isn't retried, and retry restarts from byte 0. Use `-C - --retry-all-errors --retry 10` for large downloads.
- **`llama-server` logs everything to stderr** — including INFO lines. Railway (and most log viewers) classify by stream, so everything shows as error. Append `2>&1` in the entrypoint.
- **`N_GPU_LAYERS=0 docker compose up beta-text` doesn't reach the container** — compose only interpolates host env into `${...}` in `compose.yml`, and `beta-text` takes its env from `env_file`. Use a separate `docker run ... -ngl 0` for CPU comparison.
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
- **Translation runs in a Worker pool, not on the main thread** — `tr_translate` (bun:ffi, 30–60 ms) blocked the event loop. `translate-pool.ts` + `translate.worker.ts`; `TRANSLATE_WORKERS` (1–2). In `bun build --compile` the worker file must be an extra entrypoint (`bun build ./src/index.ts ./src/modules/translate/translate.worker.ts --compile`, also in the Dockerfile), else `new Worker(new URL(...))` looks for it on disk.
- **`expect(promise).rejects` hangs while a Worker must answer** (bun test 1.4) — it waits without servicing worker messages, so the call looks stuck until the pool's timeout. In worker tests catch the rejection with try/catch and assert on the error.
- **Private workspace code in the published widget must be a `devDependency`** — `@repo/webmcp-polyfill` is `workspace:*` under the widget's `devDependencies`, so Vite inlines it into the IIFE and npm/JSR consumers never see an unpublished package. Moving it to `dependencies` would ship an unresolvable import. After a build: `grep -c "@repo" packages/pleiades-widget/dist/*.js dist-jsr/*.js` must be 0. The widget CI job now also runs the polyfill's own types/lint/tests, since `bun run test` in the widget no longer covers them.

## admin-api: better-auth trusts X-Forwarded-For by default

`auth.api.*` called from our own routes skips better-auth's HTTP rate limiter, and its `session.ipAddress` is read from `x-forwarded-for` unless `advanced.ipAddress.ipAddressHeaders` says otherwise — a client can spoof it. Fix: resolve the IP ourselves (`CLIENT_IP_SOURCE`, default `socket`), pass better-auth a copy of the headers with the client IP headers removed and `x-admin-client-ip` set, and configure `ipAddressHeaders: ["x-admin-client-ip"]`. Login throttling lives in `modules/login-throttle`.

## Widget body caps: Content-Length check is a pre-filter, Bun's `maxRequestBodySize` is the backstop

`/v1/widget/*` rejects `Content-Length > WIDGET_MAX_BODY_BYTES` in `onRequest` (before body parsing); chunked bodies carry no length, so the server-wide `HTTP_MAX_BODY_BYTES` (passed through `serve({ maxRequestBodySize })` to `app.listen`) is what stops them. Elysia's `onRequest` is global even inside a prefixed plugin, hence the explicit path check. In tests `new Request(url, { body })` sets no `content-length` header: set it by hand. `tool-results` is checked by `callId` (= id of the run that issued the `tool_call`) and `awaitedTool`, both stored in the WAITING checkpoint; the resume drops `awaitedTool`, so a replay of the same answer is refused.

- **Drizzle `.set()` rejects `sql.placeholder()` directly in prepared updates** — wrap it: ``lastSeenAt: sql`${sql.placeholder("now")}` ``. Prepared statements live in `database/prepared.ts` (cached per `Db`); `touchVisitor` is coalesced to one write per `TOUCH_COALESCE_MS` (60 s) unless the IP changed.

## Persona and delta prompt (2026-10-14)

- The shared delta prompt must name no kind of shop or product; a test greps it for shop/grocery words (`\brice\b`, not `rice`, which matches "price"). Site-specific examples belong to the per-site catalog profile (audit 7.2), not to the shared prompt. The prompt text is not yet re-measured: `apps/tools-benchmark` needs a live delta model and keeps its own grocery copy of the old prompt.
- Channel persona only fills its own slots of the reply prompt: each value is flattened to one line (control chars and newlines removed) and capped, and the fixed rules come last and say the persona is style only. The reply action reads `channelId` from the world state; the prompt itself is cached in `ChannelDirectory` (`replyPrompt`, refreshed by `invalidate()`), never stored as a fact.

- **GOAP planner (`packages/core/src/goap/plan.ts`) is uniform-cost with no heuristic** — a synthetic catalog with many equal-cost alternatives explodes (100 actions: 25 ms, 143: 360 ms for the old planner, 27 ms for the heap/bitset one). Bench catalogs must stay sparse or `bun run bench:plan` won't finish. The old implementation lives in `plan-reference.ts` only for equivalence tests/bench; heap ties are FIFO to keep the old tie-breaking. `git mv` stages — use plain `mv` when other people's staged changes are in the index.

- **drizzle `init.sql` (PO-36) must mimic the bun-sqlite migrator exactly (drizzle-orm 0.45).** `__drizzle_migrations` is `(id SERIAL PRIMARY KEY, hash text, created_at numeric)` — `SERIAL` is not an INTEGER PRIMARY KEY alias, so `id` is NULL in every row. `hash` = sha256 hex of the whole migration `.sql` file text; `created_at` = journal `when`. The migrator only compares the *last* row's `created_at` (max) against each journal `when` — hashes are never checked — so a DB from `init.sql` is a no-op, and a later migration (greater `when`) applies on top. Migrations can seed data (`0001_seed_channels`), so the dump includes all table rows, not just schema. Regenerate with `bun run db:snapshot` after every `db:generate`.
