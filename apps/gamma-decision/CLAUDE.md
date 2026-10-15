# gamma-decision internals

See root `CLAUDE.md` for monorepo commands, workflow, code style and repo-wide lessons.

## Overview

Elysia sidecar around `@receptron/laya` (Laya, a typed-decision model on ONNX Runtime): answers choice/score questions about a state with calibrated probabilities; never generates text. Consumed by `alpha-orchestrator` through the `DecisionAgent` port in `@repo/core` (intent classification, decision actions) and by `apps/benchmark`.

## API

`POST /v1/systemone` — TypeSafe Jev `system_one` shape: `{ model?, state, questions }` -> `{ model, answers, usage }`; boolean questions are `noul`. Compatible with the AI SDK `@ai-sdk/typesafe-ai` provider. Bearer auth with `LAYA_API_KEY`; `/health` and `/swagger*` are open (`modules/auth/auth.service.ts`, enforced in `onRequest`).

This replaces the earlier `POST /v1/decide`; the route module is `modules/systemone/` (being migrated, check the current code).

## Structure

`src/index.ts` (loads the engine, `serve` with `engine.close()` on shutdown) + `src/app.ts` (`createApp({ decide, apiKey, observability })` on `createKitApp`) + `modules/{config,auth,decision-engine,systemone}`. `decision-engine.ts` is the only file that touches `@receptron/laya` (`Laya.load` + `systemOne`), so the app is tested with a fake `decide` and never loads the ~1.7GB weights.

Config (`modules/config/config.ts`): `LAYA_API_KEY` (required), `LAYA_MODEL_REPO` (default `receptron/laya-onnx`, weights downloaded on first use into `~/.cache/receptron-laya`), `LAYA_MODEL_SUBFOLDER`, `LAYA_THREADS` (onnxruntime intra-op threads, default 6; 0 = onnxruntime default), `PORT` (8080).

Commands: `bun --cwd apps/gamma-decision run dev|start|test`. Host port `127.0.0.1:8090` in compose.

## Why a separate glibc image

`onnxruntime-node` is a native N-API addon with prebuilt glibc binaries: it won't load on Alpine/musl and won't bundle into a `bun build --compile` binary. So the Dockerfile is `oven/bun:1` (glibc), `turbo prune gamma-decision --docker`, plain `bun install` + `bun src/index.ts`, no `--compile`.

## Lessons

- **Laya can't load in `llama-server`** — different GGUF format (built by `ggmlc`). Run it via `@receptron/laya` / `onnxruntime-node` in this glibc sidecar. Don't conflate it with a chat LLM.
- The `LAYA_THREADS` default reflects the physical cores of the target Ryzen 5 5600H; benchmark with `bun snake` in `apps/benchmark`.
