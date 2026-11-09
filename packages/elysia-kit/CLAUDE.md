# @repo/elysia-kit internals

See root `CLAUDE.md` for monorepo commands, workflow, code style and repo-wide lessons.

## Overview

Shared Elysia setup used by `alpha-orchestrator`, `admin-api`, `gamma-decision` (Bun source import, `exports: ./src/index.ts`). Elysia and TypeBox are peer dependencies. Files import each other with explicit `.ts`. Commands: `bun --cwd packages/elysia-kit test`.

## Surface (`src/index.ts`)

- `createObservability(service, env)` (`app.ts`) -> `{ service, logger, monitoring }`; env shape `observabilityEnv` (`env.ts`: `LOG_LEVEL`, `SENTRY_*`) is spread into each app's `buildConfig`.
- Sentry (`sentry.ts`, `@sentry/elysia`): `createMonitoring` calls `Sentry.init` synchronously when `SENTRY_DSN` is set (never without it), so it must run before the app is built. `createKitApp` wraps the app in `monitoring.instrument` = `withElysia` for request spans only (`shouldHandleError: () => false`); errors are captured once, by `monitoring.plugin` (`isServerFault`). `SENTRY_TRACES_SAMPLE_RATE` (default 0.1) via `tracesSampler`, which never traces `/health`. Outgoing `fetch` gets spans and trace headers, so admin-api → orchestrator calls join one trace.
- `createKitApp({ observability, docs? })` — request logging (`request-log.ts`, `x-request-id`), `decodeSlashParams` (`path-params.ts`), Sentry plugin (`sentry.ts`), `GET /health`, optional API docs (`docs.ts`). Apps add auth hooks and routes on top.
- `onRequestGuard(logger, check)` / `hasBearer` (`guard.ts`) — auth belongs in `onRequest` (root lesson). A request rejected in `onRequest` skips the other hooks.
- `serve(app, { port, observability, onShutdown })` / `handleProcessLifecycle` (`serve.ts`) — graceful shutdown.
- `retryFetch` (`retry.ts`) — outbound fetch with backoff (used by `admin-api`'s orchestrator client).
- `resolveClientIp` + `CLIENT_IP_SOURCES` (`client-ip.ts`), `isServerFault` (`errors.ts`), `createLogger`/`jsonReporter` (`logger.ts`).

## Gotchas

- Elysia 1.4.31 does not decode `%2F` in path params (`a%2Fb` stays), 1.4.29 did. Ids with a slash (model `vendor/model`, thread ids) depend on the decode, so `createKitApp` installs `decodeSlashParams` (an `onTransform` for every route; a literal `%2F` in an id would be decoded too). A service built without `createKitApp` must `.use(decodeSlashParams())` itself.
- consola drops `.info()` in `NODE_ENV=test`; the logger sets the level explicitly (root lesson).
- `SENTRY_DSN=` empty in a copied `.env.example` means off — apps use `emptyStringAsUndefined: true`.
