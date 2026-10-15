# beta-text internals

See root `CLAUDE.md` for monorepo commands, workflow and repo-wide lessons.

## Overview

No application code: a `Dockerfile` plus a test. It is a compose-only service — `llama-server` (llama.cpp) serving Vikhr-Llama-3.2-1B (Q4_K_M) through an OpenAI-compatible API. It is the reply/chat model for `alpha-orchestrator` (`LLM_BASE_URL=http://beta-text:8080/v1`).

- Image is the official `ghcr.io/ggml-org/llama.cpp:server-vulkan-<build>` with the **tag pinned** (a bare `server-vulkan` floats). Runs on the iGPU via `/dev/dri` passthrough, `N_GPU_LAYERS=99` (whole model on GPU; `0` = CPU only). The old CPU-only from-source build is kept as a comment in the Dockerfile.
- `packages/llama-runtime/entrypoint.sh` is shared with `apps/delta-function-call`: downloads `MODEL_URL` once into the `/models` volume, then starts `llama-server` (`CTX_SIZE`, `PARALLEL`, `THREADS`, `N_GPU_LAYERS`, `LLM_TEMPERATURE`, `API_KEY` falling back to `LLM_API_KEY`, `JINJA=1` for tools/json_schema). Its stderr is merged into stdout so log viewers don't flag every line as an error.
- Temperature env is `LLM_TEMPERATURE`, never `TEMP` (Bun writes caches to `./<value>/` when `TEMP` is set in the root `.env`).
- Compose profile `beta` (set `COMPOSE_PROFILES` in the root `.env`). To run the reply model on another machine, drop `beta` from it and set `LLM_BASE_URL` (+ `LLM_MODEL`); `alpha-orchestrator` depends on it with `required: false`. Keep `LLM_MAX_CONCURRENCY` equal to `PARALLEL` (server slots); `LLM_TEMPERATURE` feeds both `--temp` here and the orchestrator client.
- Host port `127.0.0.1:8181` (container `8080`) for standalone host runs.

## Testing

`bun run test:beta-text` (root script -> `bun test apps/beta-text/docker.test.ts`) builds and boots the real image (~770MB model, up to 15 min, port 8099). It is not part of `bun run test`; don't run it casually.
