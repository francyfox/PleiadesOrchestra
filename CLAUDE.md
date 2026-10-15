# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

PleiadesOrchestra: a Turborepo monorepo (Bun workspaces, hexagonal style) of small agent-shaped services that orchestrate small local models with a GOAP planner. Services are named after Pleiades Six Stars maids with greek-letter role prefixes (`alpha-orchestrator`, `beta-text`, `gamma-decision`, `delta-function-call`). Design and phase status: `docs/harness-goap-orchestrator-plan.md`. Failures and architecture changes: `docs/lessons-learned.md`.

## Commands

Run from the repo root (Turborepo fans out per package; `test` depends on `^build`).

- `bun install` — required again after renaming/moving any `apps/*` or `packages/*` directory (relinks workspace symlinks).
- `bun run test` / `bun run lint` / `bun run check-types` / `bun run build` — all workspaces via turbo. `lint:fix` and `format` run Biome over the whole tree.
- Single package: `bun --cwd apps/alpha-orchestrator test`. Single file/test: `bun test packages/core/src/goap/plan.test.ts` (add `-t "name"` to filter).
- Run a service: `bun --cwd apps/<name> run dev` (watch) or `start`. Each has its own `.env` — copy from `.env.example`; `compose.yml` reads the root `.env` plus `apps/*/.env`. Whole stack: `docker compose up --build` (one service: `up -d --build <service>`). `COMPOSE_PROFILES` in the root `.env` picks which models run locally (`beta` = beta-text, `gamma` = gamma-decision, `delta` = delta-function-call); a model without its profile runs elsewhere, set its `*_BASE_URL`.
- `bun run test:beta-text` — builds and boots the real `llama-server` Docker image (~770MB model, up to 15 min). Not part of `bun run test`; don't run casually.
- Deployment is local-only via `compose.yml`: every published port is bound to `127.0.0.1`. Public traffic goes through the opt-in `tunnel` service (`docker compose --profile tunnel up -d tunnel`); the Telegram webhook needs it.
- Dependency versions live in root `package.json` `workspaces.catalog` (Bun catalogs); workspaces reference them as `"catalog:"`. TypeScript is 6 everywhere.

## Architecture

Map of every app and package: `docs/architecture.md`. Each has its own `CLAUDE.md` — read it before working there.

## Domain: not one shop

The project is not built for a single shop. Sites may sell groceries, electronics, clothes, anything. The Basketful demo and cheese/milk examples are fixtures, not the product.

- Don't hardcode product words or grocery assumptions into logic. Domain meaning lives in `intent-taxonomy.ts`, `message-cues.ts`, `tool-cues.ts`, the delta prompt — keep it there, comment it as the shop-domain layer.
- Everything site-specific comes from the site itself via `POST /v1/widget/tools` (names, descriptions, JSON schemas). A tool is understood from its name and schema.
- Tests and docs should vary the domain. The eval sets are grocery-heavy — extend before trusting 100% figures outside groceries.
- Channels, admin panel and widget are general-purpose (never describe as shop-specific).

## Code style

Angular-like modules in composition style (verified in `alpha-orchestrator`, `admin-api`, `gamma-decision`):

- `src/index.ts` = composition root (config, real deps, `serve`). `src/app.ts` = `createApp(deps)`, wires controllers only; tests call `app.handle`. Features live in `src/modules/<name>/`, every file `<name>.<suffix>.ts`. A new feature is a new folder, not a file in a flat folder.
- Suffixes: `<name>.ts` controller (Elysia plugin factory `<name>Routes(deps)`) or main class/factory; `.service.ts` logic as plain functions taking deps/values, testable without HTTP (domain errors live here); `.types.ts` shared interfaces/deps types; `.schema.ts` TypeBox wire DTOs (or Drizzle schema); `.instance.ts` runtime singleton (only `index.ts` and other `*.instance.ts` import it); `.testing.ts` test helpers; `.test.ts` tests next to the file; `.view.ts` rendering; `.command.ts` bunli command in CLI apps.
- Wiring: factories `create*` (deps object in, typed thing out; type via `ReturnType<typeof createX>`), `load*` for async loads, `build*` for pure builders. No DI container, no decorators. Optional deps default to in-memory fakes (`deps.now ?? Date.now`).
- Composition over inheritance: layer behaviour by wrapping (`withConcurrencyLimit(agent, limiter)`) and Elysia `.use()`. `extends` only for `Error` subclasses; classes only for stateful things (stores, registries, limiters). Ports live in `@repo/core` (`Agent`, `DecisionAgent`, `FunctionCallAgent`, `HistoryStore`, …); adapters implement them.
- Imports: explicit `.ts` extension, relative paths, no barrel `index.ts` inside modules.
- Config: `modules/config/config.ts` exports a pure `buildConfig(env)`; `config.service.ts` is the `export const config = buildConfig(process.env)` singleton that only runtime code imports.

## Workflow

- **Tasks `PO-N`** = GitHub issue #N in `francyfox/PleiadesOrchestra` (title starts with `PO-N:`). Read with `gh issue view N`.
- **Test-first**: write the test before the implementation, then make it pass.
- **Don't test the library**: for zod/t3-env schemas, only test transforms/logic you wrote. Don't assert that required fields throw or `.url()` rejects bad input — that tests zod, not the app.
- **Env validation**: `@t3-oss/env-core` + `zod`. Don't build `createEnv(...)` at module top-level in files imported by tests — use the `buildConfig(env)` / `config.service.ts` split above.
- **Lint/format**: Biome (`biome.json` at root, tabs + double quotes). `bun run lint`, `bun run lint:fix` / `bun run format`.
- **Production build**: `bun build ./src/index.ts --compile --target=bun-linux-x64-musl --outfile dist/<name>`. Still links `libstdc++`/`libgcc` dynamically — install those in the final Alpine stage.
- **On failure or architecture change**: record in `docs/lessons-learned.md` so it isn't repeated.
- **Keep this root CLAUDE.md minimal.** Every app/package has its own CLAUDE.md with its internals; a new app or package gets its own CLAUDE.md and one line in `docs/architecture.md` (linked from here, not `@`-imported, so it isn't loaded into every session).
- Don't create files/scaffolding outside what's explicitly asked for.
- **Delete confirmed-dead code/infra** rather than leaving it.
- **New agent-shaped service = propose first**: don't scaffold without asking; don't fold new agent responsibility into existing services.

## Repo-wide lessons

- **`.dockerignore`: never exclude `bun.lock`** — silently breaks any `bun install` in any Dockerfile. Keep to `**/node_modules`, `dist`, `.git`, `.idea`, `*.md`. Use `**/node_modules`, not `node_modules` — the bare pattern doesn't exclude nested `apps/*/node_modules`. `*.md` breaks Python `pyproject.toml` that declares `readme = "README.md"` — re-include with `!apps/gemini-webapi-mcp/README.md`.
- **Dockerfiles must use `turbo prune <app> --docker`** — `bun install --frozen-lockfile` validates all workspaces; new workspaces break any Dockerfile that doesn't prune.
- **Elysia auth must go in `onRequest`, not `onBeforeHandle`** — body validation runs before `onBeforeHandle`, so a bad body returns 422 before auth runs.
- **`t.Optional(t.UnionEnum([...]))` fills the first value** — use `t.Optional(t.Union([t.Literal(...),...]))` or the repo's `oneOf()`. A `TLiteral[]` union also breaks Eden body typing.
- **Elysia drops body fields not in the schema** — add every needed field to `t.Object`; don't rely on pass-through. (`POST /v1/widget/tools` once lost `required` from tool `inputSchema`.)
- **`app.handle(new Request("http://x/path"))` 404s** — Elysia slices the path at a fixed host-length offset; use `http://localhost/...` in tests.
- **consola drops `.info()` in `NODE_ENV=test`** — pass `level: LogLevels.info` explicitly to `createConsola`.
- **Don't name `.env` vars like OS vars** — `TEMP=0.3` made Bun write caches to `./0.3/`. Renamed to `LLM_TEMPERATURE`.
- **`${VAR:?msg}` in `compose.yml` evaluates for all services** including inactive profiles — use `${VAR:-}` for opt-in services.
- **Relative DB path in `env_file` moves DB off the volume** — pin container data paths in compose `environment:`, not in `.env`.
- **zsh: never name loop variables `path`** — shadows `$PATH`, kills command lookup.
- **`bun --cwd <dir> <script>` ignores `--cwd` for some subcommands** — use `cd <dir> && bun ...`.

## APIs

- `Bun.serve()` for HTTP/WebSocket. Don't use `express`.
- `bun:sqlite` for SQLite. Don't use `better-sqlite3`.
- `Bun.redis` / `Bun.sql` for Redis/Postgres. `WebSocket` is built-in.
- Prefer `Bun.file` over `node:fs`. Use `Bun.$\`cmd\`` instead of execa.

## Testing

Tests use `import { test, expect } from "bun:test"`. Default to Bun: `bun <file>`, `bun test`, `bun build`, `bun install`, `bun run <script>`, `bunx <pkg>`.
