# cli (`albedo`) internals

See root `CLAUDE.md` for monorepo commands, workflow, code style and repo-wide lessons.

## Overview

Thin Bun CLI (`@bunli/core`) over the orchestrator HTTP API, no logic of its own. Subcommands only: `send -m "text" [-t thread] [-u user] [--url]` (streams the NDJSON reply, progress on stderr, usage summary from `usage-summary.ts`); `send --agent alpha|beta|delta` asks that agent's model alone through `POST /v1/chat/completions` (`model` = the agent id, no planner, nothing recorded), `send --agent gamma -q "question" [--options a,b,c]` asks the decision agent through `POST /v1/decisions` with the message as state (yes/no, or a choice), `reset -t thread`, and `admin:create --email E [--name N] [--level 0|100]` (staff account + access token: `Bun.$` runs `admin-api admin:create` in the running container through `docker compose -p pleiades-orchestra exec -T`, so it works from any directory no compose file needed; see `apps/admin-api/CLAUDE.md`). `eval --name intents|tools|choose-tool|answers|decompose [--misses]`: runs `packages/core/eval/<name>.ts` (needs Bun and the repo checkout: found next to the source, else from the working directory up, so the compiled `./albedo` works anywhere inside the checkout) with `DECISION_*`/`FUNCTION_CALL_*`/`UNDERSTAND_*` env taken from `alpha-orchestrator agent:settings` in the running container (`eval-env.ts`), so the evals ask the models the service really uses, keys included. Production helpers over Docker go the same way: compose project name + service key, no `container_name`. `@bunli/core` has no default/root command — bare `albedo -m "..."` won't work.

Layout: `src/index.ts` (`createCLI`, registers commands), `src/commands/<name>.ts` (`defineCommand`; the `.command.ts` suffix of the root convention is not used here), `src/harness-client.ts` (HTTP client using `@repo/core` types).

## Commands

- Run: `bun --cwd apps/cli start send -m "hi"`, or install the `albedo` bin with `bun link`.
- Staff token: `bun --cwd apps/cli start admin:create --email you@example.com` (needs the stack up: `docker compose up -d admin-api`).
- Env: `HARNESS_API_KEY` (required), `HARNESS_BASE_URL` (default `http://localhost:3000`), optional `LLM_CONTEXT_SIZE` for the usage summary.
- Test: `bun --cwd apps/cli test`. No per-package `build`; runs from source. A standalone binary for the server host (no Bun there): `bun run build:albedo` at the root → `./albedo` (gitignored, ~100 MB, built for the current OS/arch; add `--target=bun-linux-x64` etc. to cross-build). `scripts/install-albedo.sh [bin-dir]` builds it for this OS/CPU (Linux incl. musl, macOS, Windows Git Bash → `.exe`) and links it into `~/.local/bin` (copies on Windows), so `albedo admin:create ...` works from anywhere.
