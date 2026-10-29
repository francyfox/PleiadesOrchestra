---
title: Orchestrator vs models alone
---

# Orchestrator vs models alone

The numbers behind the landing's "Measured" section and its flow. `bun efficiency` (`apps/benchmark`): 14 shop tasks (7 in English and Russian) on a seeded mock shop, judged by the cart and the shown product, not by the reply's words. Unless a report says local, every model, the orchestrator's too, ran hosted through OpenRouter, so times include the network.

## Reports

The orchestrator runs were redone after its delta prompt's examples were moved off every benchmark's domain (they had shared a jacket-in-size-M case and the mock shop's answer layout); the earlier reports are withdrawn.

- <a href="/benchmarks/2026-10-29-orchestrator-shop-intent-set.txt" rel="external">Orchestrator, shop intent set</a> (and voxtral-small-24b alone), 3 passes; code steps timed to the microsecond
- <a href="/benchmarks/2026-10-29-orchestrator-no-intent-set.txt" rel="external">Orchestrator, no intent set</a> (and voxtral-small-24b alone), 3 passes
- <a href="/benchmarks/2026-10-29-mistral-medium-alone.txt" rel="external">mistral-medium-3.1 alone</a>, 3 passes
- <a href="/benchmarks/2026-10-29-gpt-deepseek-alone.txt" rel="external">gpt-6-luna and deepseek-v4-flash alone</a>, 3 passes
- <a href="/benchmarks/2026-10-29-local.txt" rel="external">Orchestrator, every model local</a> on one RTX 2060 (6 GB), no API calls, 3 passes: alpha, beta and delta on QVikhr-3-4B Q4_K_M (llama.cpp `server-vulkan-b11176`, KV cache q8, thinking off), gamma on d3-lite (its own `d3_server.py`, CUDA). The "beta alone" column of this report is not part of the comparison. The card holds two models besides d3, so delta was QVikhr in that run; then <a href="/benchmarks/2026-10-29-local-arch-replay.txt" rel="external">Arch-Function-3B Q6_K as delta</a>: `bun replay --delta arch-function-3b` asked the run's 60 delta calls again on it (same prompt and schema, answers through the same repair) and all 60 matched, so the runs stay the same; the time replays every model call warm, grouped by model, with no model swap. The landing's local row is this one. Arch-Function's license needs a separate grant for commercial use: here it is only benchmarked
- Single-pass screens: <a href="/benchmarks/2026-10-29-screen-1.txt" rel="external">claude-haiku-5.5, gpt-6-luna, gemini-2.5-flash-lite</a>, <a href="/benchmarks/2026-10-29-screen-2.txt" rel="external">deepseek-v4-flash, mistral-small-2603, qwen3.7-flash</a>, <a href="/benchmarks/2026-10-29-screen-mistral.txt" rel="external">mistral-small-3.2, mistral-medium-3.1, mistral-large-2512</a>

## Reproduce

In `apps/benchmark`, with `.env` from `.env.example`:

1. For the orchestrator: the stack running, a web channel's key and origin in `ORCHESTRA_*`, and the widget's limits raised in the orchestrator's env (`WIDGET_THREADS_PER_HOUR` and the other `WIDGET_*` limits), then its container recreated.
2. The orchestrator and its reply model alone:

   ```bash
   bun efficiency --runs 3
   ```

3. Hosted models alone, straight to OpenRouter (`OPENROUTER_API_KEY`):

   ```bash
   bun efficiency --runs 3 --models mistralai/mistral-medium-3.1,openai/gpt-6-luna,deepseek/deepseek-v4-flash
   ```

4. Local models: serve them OpenAI-compatible (llama-server) and d3 on `/v1/systemone`, add them as a provider in the admin panel and pick them for the agents, then run step 2.
5. A local model that does not fit next to the others: `REPLAY_BASE_URL=… bun replay --dir <run folder> --delta <model>` (models behind a llama-server router).

Each run writes `results/efficiency/<timestamp>/`: `report.txt` (the files above) and one JSON file per task run with every model call and tool call.
