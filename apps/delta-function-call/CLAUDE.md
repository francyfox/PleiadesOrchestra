# delta-function-call internals

See root `CLAUDE.md` for monorepo commands, workflow and repo-wide lessons.

## Overview

No application code: a `Dockerfile` only. `llama-server` serving Qwen3-1.7B (Q8_0) that fills JSON arguments for WebMCP tool calls (`FunctionCallAgent` in `@repo/core`, called by `alpha-orchestrator`). Same pinned llama.cpp image and `packages/llama-runtime/entrypoint.sh` as `beta-text`; `JINJA=1` and `LLM_TEMPERATURE=0` (reproducible arguments). Host port `127.0.0.1:8282`. The delta prompt and its eval live in `apps/alpha-orchestrator` and `apps/benchmark` (`bun tools`; a test keeps the benchmark's model equal to `MODEL_URL`).

## Local or external

- Compose profile `delta` (`COMPOSE_PROFILES` in the root `.env`). `alpha-orchestrator` has no `depends_on` on it (the model downloads on first start).
- Local server slots/threads come from `DELTA_PARALLEL` / `DELTA_THREADS` in the root `.env` (defaults 1 / 2); keep `FUNCTION_CALL_MAX_CONCURRENCY` equal to `DELTA_PARALLEL`.
- External machine: drop `delta` from `COMPOSE_PROFILES` and set `FUNCTION_CALL_BASE_URL` (+ `FUNCTION_CALL_MODEL`). Ollama + Qwen3 thinks by default, so its model in `providers.toml` needs `reasoning_effort = "none"` (seeded so on first start). `FUNCTION_CALL_API_KEY` is still required by compose.
