# telegram-bot internals

See root `CLAUDE.md` for monorepo commands, workflow, code style and repo-wide lessons.

## Overview

GramIO webhook adapter: no LLM, memory or access logic. For each text message it asks the orchestrator `POST /v1/access` (`access.ts`, channel `telegram`), stays silent on `allowed: false` or on a failed check, then streams `POST /v1/messages` (`harness-client.ts`) into a "Думаю..." status message that is edited with a throttle (`transferum` `createThrottleTransfer`, `status-message.ts`). The whitelist/blocks live in the orchestrator DB (admin panel; seed with `import:telegram-whitelist` in `apps/alpha-orchestrator`).

Flat layout, not the module convention: `index.ts` (`Bun.serve` with `/health` and `/webhook`, graceful stop), `bot.ts`, `handlers/{start,message}.ts`, `plugins/`, `config.ts` (`buildConfig`) + `env.ts` (singleton).

## Commands

`bun --cwd apps/telegram-bot run dev|start|test`; `build` -> `dist/telegram-bot` (`bun build --compile`, musl). Env (`.env.example`): `TELEGRAM_TOKEN`, `HARNESS_BASE_URL`, `HARNESS_API_KEY`, `PORT`, `TELEGRAM_WEBHOOK_URL`, `TELEGRAM_WEBHOOK_SECRET`.

## Gotchas

- Webhook mode (not long polling) avoids "Conflict: terminated by other getUpdates request" on restarts. It needs a public URL: `docker compose --profile tunnel up -d tunnel`.
- `harness-client.ts` is a local copy of the streaming client (the `harness` naming predates the `alpha-orchestrator` rename); `HarnessForbiddenError` = 403 for denied users.
