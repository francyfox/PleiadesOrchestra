
## Architecture

Turborepo monorepo (Bun workspaces), hexagonal style:

- `packages/core` (`@repo/core`) — the harness: LLM calls (Vercel AI SDK, OpenAI-compatible provider pointed at `albedo`), bounded per-thread conversation memory. Exposes a single `Agent` port (`handleMessage`/`resetThread`) that every transport adapter calls. No transport-specific code here.
- `apps/telegram-bot` — GramIO adapter (long polling). Thin: whitelist check (`ALLOWED_TELEGRAM_USER_IDS`) + calls into `@repo/core`. No LLM/memory logic of its own.
- `packages/core/src/telemetry.ts` — structured telemetry (consola + a custom JSON reporter to stdout). Two typed functions only, `logMessageEvent`/`logLlmState` — no generic passthrough logger, so there's no code path that could accidentally log chat content. Field names follow OpenTelemetry GenAI semantic conventions for the LLM fields (`gen_ai.provider.name`, `gen_ai.request.model`, `gen_ai.usage.input_tokens`/`output_tokens`).
- Future transports (e.g. Discord) go in their own `apps/*`, depending on `@repo/core` the same way — that's the point of the hexagonal split.
- `apps/albedo` — Dockerfile/`entrypoint.sh` (unrelated to the JS monorepo) that deploy `albedo`, the self-hosted `llama-server`, as its own Railway service. Nothing deployable lives at the true repo root — every service is under `apps/*`, matching the sibling `lalasynth` project's layout (see Lessons learned for why this matters).
- **Deployment**: services are GitHub-connected (`francyfox/albedo`, one repo, multiple services — not separate repos per service). Each service has its own `apps/<name>/railway.toml` with `build.dockerfilePath = "apps/<name>/Dockerfile"` and `build.dockerContextDir = "."` (both paths relative to the true repo root, regardless of where the toml file itself lives or what a service's Root Directory is set to).

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
