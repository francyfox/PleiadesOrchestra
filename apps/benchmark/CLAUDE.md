# benchmark internals

See root `CLAUDE.md` for monorepo commands, workflow, code style and repo-wide lessons.

## Overview

Every benchmark of the repo as one bunli CLI (not a service, not in compose). `bun start` shows a menu; `bun start <name>` or the script runs one directly (`--help` lists flags). Results go to `results/` (gitignored) with `--output`.

- `bun tools` — delta (Qwen3-1.7B) argument accuracy on the complex cases: one request per kind of site, filled field by field (`fillOnce` from `@repo/core`, answer budgets 48 tokens for the "which optional fields" step, 128 per field). Shows request -> arguments with source words coloured by kind, then a table (all-fields accuracy, per kind, p50/p90, tokens, delta calls). `--laya` hands enums and booleans to Laya in one pass and delta fills the rest.
- `bun laya` (module `choices`) — Laya accuracy on enum/boolean decisions alone (given / unsaid / refused), the share of `tools --laya`. `--samples file` saves every raw answer with its right answer (`packages/core/eval/data/laya-choices.json`) for `bun run calibrate` in core.
- `bun snake` — Laya latency playing Snake (live board or `--headless`); `--threads 1,2,4` compares onnxruntime threads in-process (`bun sweep`).

All three call Laya through `createDecisionAgent` (AI SDK `experimental_decide`): the server model when `LAYA_BASE_URL` is set, otherwise `laya/laya.model.ts`, an in-process decision model over `@receptron/laya`. Same code path either way; one pass and ignored `--threads` for a server.

## Structure

`src/index.ts` is the composition root (createCLI, commands, menu). Everything else is `src/modules/<name>/` with `<name>.<suffix>.ts`: `.command.ts` bunli command, `.ts` main factory/class, `.service.ts` pure logic, `.types.ts`, `.view.ts` terminal rendering, `.cases.ts` fixtures, plus `.model.ts` / `.server.ts` / `.prompt.ts` / `.fields.ts` where a module has more than one role. No barrels; factories `create*`/`load*` take a deps object.

- `config` — `buildConfig(env)` + `config.service.ts` singleton.
- `menu`, `report` (`accuracyMark`, `metricTable`, `pct`), `stats` (`summarizeLatency`, `summarizeRuns`, one percentile).
- `delta` — `DELTA_MODEL` (a test keeps it equal to delta's Dockerfile `MODEL_URL`), llama-server lifecycle in Docker (`startServer`/`connectServer`/`ensureModel`), `createDelta` (per-field filling), prompts (`delta.prompt.ts`, `delta.fields.ts`, `delta.service.ts`).
- `laya` — `loadLaya` (server or in-process), `createLayaModel` (the adapter; mapping unit-tested with a fake Laya), questions/answers <-> tool arguments (`laya.service.ts`).
- `tools`, `choices`, `snake` — one folder per command: cases, judging, view, command. `SnakeGame` is the only class (stateful).

## Env (`apps/benchmark/.env`, see `.env.example`)

- `DELTA_BASE_URL` — a running Ollama/llama-server (root, with or without `/v1`); unset: `bun tools` starts delta's image in Docker. `DELTA_API_KEY`, `DELTA_MODEL` (Ollama needs the name, e.g. `qwen3:1.7b-q8_0`).
- `LAYA_BASE_URL` — the server root (client appends `/v1/systemone`), `LAYA_API_KEY`. Empty/unset: Laya loads in-process on CPU.

## Notes

- CPU by default, 4 threads. `tools --gpu` offloads to Vulkan, meaningful only where the whole model fits in VRAM (the dev iGPU has 0.5 GB).
- Cases are English only (the translator runs before delta/Laya in production) and vary the domain (CLAUDE.md "Domain: not one shop"): extend with other domains before trusting 100% figures.
- Reference numbers (6 complex cases, Ollama `qwen3:1.7b-q8_0`): all fields ~33%, p50 ~840 ms; with `--laya` ~17%, p50 ~640 ms. `bun laya` on a GPU server: 64/87 decisions, p50 ~33 ms; the same weights in-process on 4 CPU threads: same accuracy, p50 ~400 ms.
- Qwen3 in Ollama ignores `chat_template_kwargs`: it needs `reasoningEffort: "none"` in `providerOptions` (camelCase; a literal `reasoning_effort` key is overwritten), otherwise it thinks ~1000 tokens and the schema leaves an empty object.
- The 48/128 answer budgets cut Qwen3's runaway "thinking" inside JSON strings, which used to run to the old 512-token cap.
- Laya reads option names as text: `price_low` lost to `price_high` on "cheapest first" until `readable()` turned machine values into words.
- In-process Laya rounds probabilities to 4 decimals; the adapter declares that in `rounding`, or `experimental_decide` rejects distributions that sum to 1.0001.
