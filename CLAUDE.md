
## Architecture

Turborepo monorepo (Bun workspaces), hexagonal style:

- `packages/core` (`@repo/core`) — LLM client library: Vercel AI SDK, OpenAI-compatible provider pointed at `albedo`, bounded per-thread conversation memory, structured telemetry. Exposes a single `Agent` port (`handleMessage`/`resetThread`). No transport-specific code, and no HTTP server of its own — it's a library, imported by `apps/harness`, not deployed standalone.
- `apps/harness` — the actual harness service: a Bun HTTP server (`POST /v1/messages`, `POST /v1/threads/:id/reset`, `GET /health`) and the *only* consumer of `@repo/core`. Normalizes incoming text with `transferum` (pure operator-composition pipeline — see the `transferum` skill for the library's patterns) before it reaches the LLM, then calls into `@repo/core` to talk to `albedo`. Transport adapters authenticate with `Authorization: Bearer <HARNESS_API_KEY>`. Conversation history is still `@repo/core`'s in-memory `ThreadHistory` for now; a `turing-db/turingdb` (in-memory columnar graph DB, sidecar deployment, no official JS/Bun client — hand-rolled HTTP client needed) for persistent history is a planned follow-up, not yet wired in.
- `apps/telegram-bot` — GramIO adapter (webhook, not long polling — avoids "Conflict: terminated by other getUpdates request" during Railway rolling deploys). Thin: whitelist check (`ALLOWED_TELEGRAM_USER_IDS`) + forwards to `apps/harness` over HTTP (`HARNESS_BASE_URL`/`HARNESS_API_KEY`). No LLM/memory/normalization logic of its own — all of that now lives in `apps/harness`.
- `apps/cli` (`albedo` command) — a Bun CLI on `@bunli/core`, another thin `apps/harness` HTTP client (same `HARNESS_BASE_URL`/`HARNESS_API_KEY` contract as `apps/telegram-bot`; duplicates its own small `harness-client.ts` rather than sharing one, matching the sibling-apps-are-independent pattern here). Two subcommands: `send -m "text" [-t threadId] [-u userId]` (streams the NDJSON reply to stdout) and `reset -t threadId`. `@bunli/core` has **no default/root command** (see Lessons learned) — there's no bare `albedo -m "text"`. Install with `bun link` from inside `apps/cli`, then run via `bunx albedo send -m "..."`; without linking, `bun --cwd apps/cli run start send -m "..."` works too.
- `packages/core/src/telemetry.ts` — structured telemetry (consola + a custom JSON reporter to stdout). Two typed functions only, `logMessageEvent`/`logLlmState` — no generic passthrough logger, so there's no code path that could accidentally log chat content. Field names follow OpenTelemetry GenAI semantic conventions for the LLM fields (`gen_ai.provider.name`, `gen_ai.request.model`, `gen_ai.usage.input_tokens`/`output_tokens`). `apps/harness` logs `logLlmState` (it owns the LLM call); `apps/telegram-bot` still logs `logMessageEvent` for its own transport-level latency/success.
- Future transports (e.g. Discord) go in their own `apps/*`, calling `apps/harness` over HTTP the same way `apps/telegram-bot` does — that's the point of the hexagonal split.
- `apps/albedo` — Dockerfile/`entrypoint.sh` (unrelated to the JS monorepo) that deploy `albedo`, the self-hosted `llama-server`, as its own Railway service. Nothing deployable lives at the true repo root — every service is under `apps/*`, matching the sibling `lalasynth` project's layout (see Lessons learned for why this matters).
- **Deployment**: services are GitHub-connected (`francyfox/albedo`, one repo, multiple services — not separate repos per service). Each service has its own `apps/<name>/railway.toml` with `build.dockerfilePath = "apps/<name>/Dockerfile"` and `build.dockerContextDir = "."` (both paths relative to the true repo root, regardless of where the toml file itself lives or what a service's Root Directory is set to).
- **Local dev**: `docker-compose.yml` at the repo root runs `albedo` + `harness` by default (`docker compose up --build`; model is cached in a named volume, not re-downloaded per restart). `telegram-bot` sits behind the `bot` compose profile (`docker compose --profile bot up`) since webhook mode needs a publicly reachable tunnel URL (ngrok/cloudflared) and — as currently configured — shares its bot token with the Railway deployment, so running it locally steals the webhook from prod for as long as the container is up. `apps/cli` isn't a compose service — it's meant to be run directly against whichever `harness` (local or prod) you point `HARNESS_BASE_URL` at.

## Workflow

- **Test-first**: write the test before the implementation, then make it pass. Don't write code without a failing test first.
- **Don't test the library, test your code**: for zod/t3-env schemas, only test transforms/logic you actually wrote (e.g. a custom `.transform()`). Don't write tests asserting that a required field throws when missing, or that `.url()` rejects a bad URL, or that `.default()` applies — that's testing zod, not the app.
- **Env validation**: use `@t3-oss/env-core` + `zod` for environment variable parsing/validation. Do not use `env-var`. Don't build the `createEnv(...)` singleton at module top-level in a file that's also imported by tests — it eagerly reads `process.env` and breaks importing the module under test env. Split: a pure `buildConfig(env)` factory (testable) in one file, and a thin `export const config = buildConfig(process.env)` singleton in a separate file that only runtime code imports.
- **Lint/format**: Biome (`biome.json` at repo root, tabs + double quotes). `bun run lint` (turbo, per-package), `bun run lint:fix` / `bun run format` at the root for the whole tree.
- **Production build for Bun apps**: `bun build ./src/index.ts --compile --target=bun-linux-x64-musl --outfile dist/<name>` produces a real standalone binary (Bun runtime embedded, no `node_modules` needed at runtime) — don't assume this won't work because of dependencies; it does, even for apps with several npm deps. The musl target lets the final Docker image be a plain `alpine` base. That binary still dynamically links `libstdc++`/`libgcc` (same as the `llama-server` binary in the root Dockerfile) — install those two packages in the final Alpine stage or it'll fail with relocation errors.
- **On failure or architecture change**: when something breaks, a real lesson is learned (wrong assumption, dead end, limitation discovered the hard way), or the architecture is changed, record it in this file at the end of the task so it isn't repeated.
- Don't create files/scaffolding outside what's explicitly asked for in the current task.
- **Delete confirmed-dead code/infra**: once something is established as no longer going to be used, it's fine and preferred to actually delete it rather than leaving it lying around "just in case". Don't let confirmed dead ends linger.

## Lessons learned

- IronClaw (nearai/ironclaw) cannot work with small self-hosted CPU-only LLMs: its agentic harness bundles ~15000 tokens of compiled-in system skills (32 skills, unconditionally seeded at onboarding, not removable via env vars, config.toml, CLI, or direct file/DB edits — they're compiled into the binary) plus a hard ~30s internal timeout on LLM calls. A 1B model on a few CPU cores can't process that much prompt in time. Don't try to force IronClaw onto a small local model again — use the custom hexagonal core/adapter setup under `packages/core` + `apps/*` instead (see `docs/telegram-bot-plan.md`). The experiment (service, volume, `ironclaw/` dir) was deleted for good on 2026-08-03 — don't recreate it.
- `railway service delete` does **not** delete a volume attached to that service — it's left behind, orphaned (`Attached to: N/A`). Delete it separately with `railway volume delete -v <volume-name>`.
- A monorepo-wide `.dockerignore` that excludes `bun.lock` (added for the root llama.cpp `Dockerfile`, which doesn't need it) silently breaks any other Dockerfile in the repo that does a real `bun install` — Docker just reports the file missing from the build context. Keep `.dockerignore` generic (`node_modules`, `dist`, `.git`, `.idea`, `*.md`) and never exclude package-manager lockfiles.
- When testing a Dockerfile locally by hand (not through `bun test`), remember `docker run -e VARNAME` only forwards a variable that is actually *exported* in the host shell. Sourcing a plain `KEY=value` `.env` file (`source .env`) does not export anything — use `set -a; source .env; set +a` first, or Bun's own auto-loading won't help since it's a different process.
- Don't reach for `pino` for low-volume apps (a personal bot, a few log lines a minute): it's built for high-throughput batched writes, its single-argument form does **not** accept a plain `{ write() }` object as a destination (silently falls back to real stdout instead of your test double — verified empirically, don't assume), and its pretty-printer (`pino-pretty`) alone pulls in ~25 transitive packages. `consola` (createConsola + a custom `ConsolaReporter`) does the same job with ~7 packages, and is trivially testable: pass an in-memory reporter object, no fake Node stream needed.
- `bun test` sets `NODE_ENV=test` automatically. `consola` lowers its default log level when it detects a test environment (via `NODE_ENV`), which silently drops `.info()` calls — including in application code under test, not just consola's own test suite. Anything that logs via consola and must not depend on environment (like telemetry) needs an explicit `level: LogLevels.info` (or higher) passed to `createConsola`, not the default.
- `bun install --frozen-lockfile` validates against the `package.json` of **every** workspace member, not just the ones a given build actually depends on. `apps/harness/Dockerfile` and `apps/telegram-bot/Dockerfile` each only `COPY`'d their own + `packages/core`'s `package.json` into the install stage — that happened to work while those two were the only non-core workspaces, but broke both builds (`error: lockfile had changes, but lockfile is frozen`) the moment `apps/cli` was added as a third. Fix was to `COPY` every sibling app's `package.json` too, not just the one being built. Remember to add the new one to both existing Dockerfiles the next time a workspace is added.
- `curl --retry N` does not cover every transient failure — a mid-transfer connection reset (`curl: (56) Recv failure`) during `apps/albedo/entrypoint.sh`'s ~770MB GGUF model download wasn't retried, and a plain retry restarts from byte 0 anyway. Fixed with `-C -` (resume) plus `--retry-all-errors --retry 10`; needed for any large download over a flaky link, not just this one.
- `@bunli/core` (used by `apps/cli`) has no default/root command — its `findCommand()` requires an exact positional match against a registered command name, with no fallback to "the only registered command" or the CLI's own name. A bare `albedo -m "text"` invocation isn't achievable with it; every call needs an explicit subcommand (`albedo send -m "text"`). Don't assume a single-command bunli CLI can drop the subcommand keyword.

Default to using Bun instead of Node.js.

- Use `bun <file>` instead of `node <file>` or `ts-node <file>`
- Use `bun test` instead of `jest` or `vitest`
- Use `bun build <file.html|file.ts|file.css>` instead of `webpack` or `esbuild`
- Use `bun install` instead of `npm install` or `yarn install` or `pnpm install`
- Use `bun run <script>` instead of `npm run <script>` or `yarn run <script>` or `pnpm run <script>`
- Use `bunx <package> <command>` instead of `npx <package> <command>`
- Bun automatically loads .env, so don't use dotenv.

## APIs

- `Bun.serve()` supports WebSockets, HTTPS, and routes. Don't use `express`.
- `bun:sqlite` for SQLite. Don't use `better-sqlite3`.
- `Bun.redis` for Redis. Don't use `ioredis`.
- `Bun.sql` for Postgres. Don't use `pg` or `postgres.js`.
- `WebSocket` is built-in. Don't use `ws`.
- Prefer `Bun.file` over `node:fs`'s readFile/writeFile
- Bun.$`ls` instead of execa.

## Testing

Use `bun test` to run tests.

```ts#index.test.ts
import { test, expect } from "bun:test";

test("hello world", () => {
  expect(1).toBe(1);
});
```

## Frontend

Use HTML imports with `Bun.serve()`. Don't use `vite`. HTML imports fully support React, CSS, Tailwind.

Server:

```ts#index.ts
import index from "./index.html"

Bun.serve({
  routes: {
    "/": index,
    "/api/users/:id": {
      GET: (req) => {
        return new Response(JSON.stringify({ id: req.params.id }));
      },
    },
  },
  // optional websocket support
  websocket: {
    open: (ws) => {
      ws.send("Hello, world!");
    },
    message: (ws, message) => {
      ws.send(message);
    },
    close: (ws) => {
      // handle close
    }
  },
  development: {
    hmr: true,
    console: true,
  }
})
```

HTML files can import .tsx, .jsx or .js files directly and Bun's bundler will transpile & bundle automatically. `<link>` tags can point to stylesheets and Bun's CSS bundler will bundle.

```html#index.html
<html>
  <body>
    <h1>Hello, world!</h1>
    <script type="module" src="./frontend.tsx"></script>
  </body>
</html>
```

With the following `frontend.tsx`:

```tsx#frontend.tsx
import React from "react";
import { createRoot } from "react-dom/client";

// import .css files directly and it works
import './index.css';

const root = createRoot(document.body);

export default function Frontend() {
  return <h1>Hello, world!</h1>;
}

root.render(<Frontend />);
```

Then, run index.ts

```sh
bun --hot ./index.ts
```

For more information, read the Bun API docs in `node_modules/bun-types/docs/**.mdx`.
