# cli (`albedo`) internals

See root `CLAUDE.md` for monorepo commands, workflow, code style and repo-wide lessons.

## Overview

Thin Bun CLI (`@bunli/core`) over the orchestrator HTTP API, no logic of its own. Subcommands only: `send -m "text" [-t thread] [-u user] [--url]` (streams the NDJSON reply, progress on stderr, usage summary from `usage-summary.ts`) and `reset -t thread`. `@bunli/core` has no default/root command — bare `albedo -m "..."` won't work.

Layout: `src/index.ts` (`createCLI`, registers commands), `src/commands/<name>.ts` (`defineCommand`; the `.command.ts` suffix of the root convention is not used here), `src/harness-client.ts` (HTTP client using `@repo/core` types).

## Commands

- Run: `bun --cwd apps/cli start send -m "hi"`, or install the `albedo` bin with `bun link`.
- Env: `HARNESS_API_KEY` (required), `HARNESS_BASE_URL` (default `http://localhost:3000`), optional `LLM_CONTEXT_SIZE` for the usage summary.
- Test: `bun --cwd apps/cli test`. No `build` script; runs from source.
