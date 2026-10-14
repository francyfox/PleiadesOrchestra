# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

Run from the repo root unless noted (Turborepo fans out per package; `test` depends on `^build`).

- `bun install` — required again after renaming/moving any `apps/*` or `packages/*` directory (relinks workspace symlinks).
- `bun run test` / `bun run lint` / `bun run check-types` / `bun run build` — all workspaces via turbo. `lint:fix` and `format` run Biome over the whole tree.
- Single package: `bun --cwd apps/alpha-orchestrator test`. Single file/test: `bun test packages/core/src/goap/plan.test.ts` (add `-t "name"` to filter).
- Run a service locally: `bun --cwd apps/<name> run dev` (watch) or `start`. Each has its own `.env` — copy from `.env.example`; `compose.yml` reads the root `.env` plus `apps/*/.env`.
- Whole stack: `docker compose up --build` (includes `telegram-bot`; a single service: `docker compose up -d --build <service>`).
- `bun run test:beta-text` — builds and boots the real `llama-server` Docker image (~770MB model, up to 15 min). Not part of `bun run test`; don't run casually.
- Only `alpha-orchestrator` and `telegram-bot` have a `build` script (`bun build --compile` binaries into `dist/`); `admin-api`'s Docker image compiles the same way; `cli`/`gamma-decision` run straight from source. The orchestrator's binary is named `dist/harness`. `apps/admin` builds with Vite (`bun --bun vite build` → `build/`, `adapter-static`).
- DB migrations (drizzle-kit): `bun --cwd apps/alpha-orchestrator run db:generate --name <name>` after editing the schema; same in `apps/admin-api` (`auth:schema` regenerates the better-auth schema first). Both apply migrations at startup. Run `bunx biome format --write <app>/drizzle/meta` after generating, then `bun --cwd <app> run db:snapshot` to regenerate `<app>/drizzle/init.sql` (single first-time-setup SQL file; a test fails on drift).
- One-off: `bun --cwd apps/alpha-orchestrator run import:telegram-whitelist <ids>` seeds the Telegram whitelist.

## Architecture

Turborepo monorepo (Bun workspaces), hexagonal style. **Naming**: PleiadesOrchestra — agent-shaped services named after Pleiades Six Stars maids with greek-letter role prefixes: `alpha-orchestrator`, `beta-text`, `gamma-decision`. See `docs/harness-goap-orchestrator-plan.md` for design and phase status.

- **`packages/core`** (`@repo/core`) — LLM client library: Vercel AI SDK, OpenAI-compatible provider, GOAP planner/executor (`src/goap/`). No HTTP server, no transport code. `WorldState` is a flat key→value fact bag; actions declare preconditions/effects. Exposes `Agent` port (`handleMessage`/`resetThread`), `DecisionAgent` port (HTTP to `gamma-decision`), `FunctionCallAgent` port (HTTP to `delta-function-call`).
- **`apps/alpha-orchestrator`** — Elysia HTTP service: `POST /v1/messages` (NDJSON GOAP stream), access control, SQLite DB (users, channels, llm_calls, plan_runs, plan_events), widget API (`/v1/widget/*`), admin routes (`/v1/admin/*`). Only consumer of `@repo/core`. See `apps/alpha-orchestrator/CLAUDE.md` for internals (GOAP, intent, translation, reply, widget errors, flow).
- **`apps/beta-text`** — Dockerfile/entrypoint for `llama-server` (Vulkan, pinned `ghcr.io/ggml-org/llama.cpp:server-vulkan-<build>` tag, `N_GPU_LAYERS=99`, `/dev/dri` passthrough). Compose service only.
- **`apps/gamma-decision`** — glibc `oven/bun:1` sidecar running `@receptron/laya` typed-decision inference (`LAYA_THREADS` threads). Separate image because `onnxruntime-node` won't bundle into a musl `--compile` binary.
- **`apps/delta-function-call`** — Qwen3-1.7B `llama-server` (port 8282, same image/entrypoint as `beta-text`) that fills JSON arguments for WebMCP tool calls.
- **`apps/telegram-bot`** — GramIO webhook adapter. Calls `POST /v1/access` then forwards to `alpha-orchestrator`. No LLM/memory logic.
- **`apps/cli`** (`albedo`) — Bun CLI (`@bunli/core`), thin `alpha-orchestrator` HTTP client. Two subcommands: `send -m "text" [-t id] [-u id]` and `reset -t id`. Install with `bun link`; `@bunli/core` has no default/root command — bare `albedo -m "..."` won't work.
- **`apps/admin-api`** — Elysia BFF: better-auth admin accounts (own SQLite), orchestrator proxy, host metrics (`/proc`, `/sys/class/drm`). See `apps/admin-api/CLAUDE.md`.
- **`apps/admin`** — Svelte 5 SPA (shadcn-svelte, TanStack Query v6, `adapter-static`, no SSR). Talks to `admin-api` via typed Eden client. See `apps/admin/CLAUDE.md`.
- **`packages/pleiades-widget`** — framework-agnostic `<pleiades-chat>` web component (Alpine.js CSP build, 40 kB brotli budget). See `packages/pleiades-widget/CLAUDE.md`.
- **`packages/webmcp-polyfill`** (`@repo/webmcp-polyfill`, Apache-2.0, private) — WebMCP `document.modelContext` polyfill (ported from Google's webmcp-tools); `installWebMcpPolyfill`. A widget **devDependency**: Vite bundles it into the published widget, so it must never become a runtime dependency.
- **`packages/elysia-kit`** (`@repo/elysia-kit`) — shared Elysia setup: `createKitApp` (request logging, Sentry, `/health`, optional Swagger), `onRequestGuard`, `serve` (graceful shutdown), `retryFetch` (outbound with backoff).
- **`apps/pleiades-mcp`** — stdio MCP server exposing the orchestrator as Claude Code tools (`pleiades_list_sites`, `pleiades_site_task`). Not a compose service.
- **`apps/gemini-webapi-mcp`** — Python/uv MCP server for Gemini web app (profile `gemini`, port 8765).
- **`packages/core/src/telemetry.ts`** — structured telemetry (`logMessageEvent`/`logLlmState`, OpenTelemetry GenAI field names, JSON to stdout).
- **`apps/benchmark`** — every benchmark of the repo, one bunli CLI (not a service, not in compose): `bun start` shows a menu; `bun tools` = delta argument accuracy (English cases, delta's model only; a test keeps it equal to delta's `MODEL_URL`), `bun snake` = Laya latency. Both default to CPU, 4 threads (`tools --gpu` for Vulkan — only meaningful where the whole model fits in VRAM; the dev iGPU has 0.5 GB). Results go to `results/` (gitignored).
- **Deployment**: local-only via `compose.yml`. Every published port is bound to `127.0.0.1` (orchestrator `3000`, beta-text `8181`, delta `8282`, gamma `8090` — the last three for standalone host runs; admin-api `3003`, admin panel `3002` when enabled). Public traffic goes through the `tunnel` service, which is opt-in (`docker compose --profile tunnel up -d tunnel`). SQLite DBs bind-mounted from `./data/<service>/`. Telegram bot webhook needs that tunnel.
- **Dependency versions** in root `package.json` `workspaces.catalog` (Bun catalogs). Workspaces reference as `"catalog:"`. TypeScript is 6 everywhere.
- **`apps/pleiades-plugin`** (WXT browser extension) is excluded from the workspace (`"!apps/pleiades-plugin"` in root `workspaces.packages`) — remove the negation when it should build with the rest.

## Domain: not one shop

The project is not built for a single shop. Sites may sell groceries, electronics, clothes, anything. The Basketful demo and cheese/milk examples are fixtures, not the product.

- Don't hardcode product words or grocery assumptions into logic. Domain meaning lives in `intent-taxonomy.ts`, `message-cues.ts`, `tool-cues.ts`, the delta prompt — keep it there, comment it as the shop-domain layer.
- Everything site-specific comes from the site itself via `POST /v1/widget/tools` (names, descriptions, JSON schemas). A tool is understood from its name and schema.
- Tests and docs should vary the domain. The eval sets are grocery-heavy — extend before trusting 100% figures outside groceries.
- Channels, admin panel and widget are general-purpose (never describe as shop-specific).

## Workflow

- **Tasks `PO-N`** = GitHub issue #N in `francyfox/PleiadesOrchestra` (title starts with `PO-N:`). Read with `gh issue view N`.
- **Test-first**: write the test before the implementation, then make it pass.
- **Don't test the library**: for zod/t3-env schemas, only test transforms/logic you wrote. Don't assert that required fields throw or `.url()` rejects bad input — that tests zod, not the app.
- **Env validation**: `@t3-oss/env-core` + `zod`. Don't build `createEnv(...)` at module top-level in files imported by tests. Split: a pure `buildConfig(env)` factory + a thin `export const config = buildConfig(process.env)` singleton that only runtime code imports.
- **Lint/format**: Biome (`biome.json` at root, tabs + double quotes). `bun run lint` (turbo), `bun run lint:fix` / `bun run format` for the whole tree.
- **Production build**: `bun build ./src/index.ts --compile --target=bun-linux-x64-musl --outfile dist/<name>`. Still links `libstdc++`/`libgcc` dynamically — install those in the final Alpine stage.
- **On failure or architecture change**: record in `docs/lessons-learned.md` so it isn't repeated.
- Don't create files/scaffolding outside what's explicitly asked for.
- **Delete confirmed-dead code/infra** rather than leaving it.
- **New agent-shaped service = propose first**: don't scaffold without asking; don't fold new agent responsibility into existing services.

## Lessons Learned (critical)

Full list in `docs/lessons-learned.md`. Most critical items:

- **IronClaw won't work with small local models** — ~15k token system prompt + 30s timeout. Use the custom core/adapter setup.
- **`.dockerignore`: never exclude `bun.lock`** — silently breaks any `bun install` in any Dockerfile in the repo. Keep to `**/node_modules`, `dist`, `.git`, `.idea`, `*.md`.
- **Use `**/node_modules` not `node_modules` in `.dockerignore`** — bare pattern doesn't exclude nested `apps/*/node_modules`.
- **Dockerfiles must use `turbo prune <app> --docker`** — `bun install --frozen-lockfile` validates all workspaces; new workspaces break any Dockerfile that doesn't prune.
- **consola drops `.info()` in `NODE_ENV=test`** — pass `level: LogLevels.info` explicitly to `createConsola`.
- **`createOpenAICompatible` needs `includeUsage: true`** — otherwise streamed token counts are `undefined`.
- **Elysia auth must go in `onRequest`, not `onBeforeHandle`** — body validation runs before `onBeforeHandle`, so a bad body returns 422 before auth runs.
- **`t.Optional(t.UnionEnum([...]))` fills the first value** — use `t.Optional(t.Union([t.Literal(...),...]))` or the repo's `oneOf()`. A `TLiteral[]` union also breaks Eden body typing.
- **`bun build --compile` doesn't embed drizzle migrations** — copy `drizzle/` into the Docker image and set `DATABASE_MIGRATIONS_DIR`.
- **`apps/admin` needs TypeScript 6** — two TS versions cause Bun to link two copies of `elysia`, breaking Eden's `Treaty` type check.
- **CSRF: `localhost` ≠ `127.0.0.1`** — both must be in `ADMIN_TRUSTED_ORIGINS`.
- **`/proc`/`/sys` are the host's, not the container's** — no extra mounts needed for host metrics.
- **Relative DB path in `env_file` moves DB off the volume** — pin container data paths in compose `environment:`, not in `.env`.
- **`apps/admin`: everything in `devDependencies`** — static build, nothing installs at runtime.
- **Don't name `.env` vars like OS vars** — `TEMP=0.3` made Bun write caches to `./0.3/`. Renamed to `LLM_TEMPERATURE`.
- **`${VAR:?msg}` in `compose.yml` evaluates for all services** including inactive profiles — use `${VAR:-}` for opt-in services.
- **`.dockerignore: *.md` breaks Python `pyproject.toml`** if it declares `readme = "README.md"` — re-include with `!apps/gemini-webapi-mcp/README.md`.
- **Elysia drops body fields not in the schema** — add every needed field to `t.Object`; don't rely on pass-through. (`POST /v1/widget/tools` once lost `required` from tool `inputSchema`.)
- **Failed GOAP run must not leave stale WorldState as checkpoint** — only a WAITING run keeps its full state; every other end keeps just `SESSION_FACTS`.
- **zsh: never name loop variables `path`** — shadows `$PATH`, kills command lookup.
- **`app.handle(new Request("http://x/path"))` 404s** — Elysia slices the path at a fixed host-length offset; use `http://localhost/...` in tests.
- **Laya can't load in `llama-server`** — different GGUF format. Run via `@receptron/laya` in a glibc sidecar.
- **`bun --cwd <dir> <script>` ignores `--cwd` for some subcommands** — use `cd <dir> && bun ...`.

## APIs

- `Bun.serve()` for HTTP/WebSocket. Don't use `express`.
- `bun:sqlite` for SQLite. Don't use `better-sqlite3`.
- `Bun.redis` / `Bun.sql` for Redis/Postgres. `WebSocket` is built-in.
- Prefer `Bun.file` over `node:fs`. Use `Bun.$\`cmd\`` instead of execa.

## Testing

```ts
import { test, expect } from "bun:test";
test("hello world", () => { expect(1).toBe(1); });
```

Default to Bun: `bun <file>`, `bun test`, `bun build`, `bun install`, `bun run <script>`, `bunx <pkg>`.
