# @repo/core internals

See root `CLAUDE.md` for monorepo commands, workflow, code style and repo-wide lessons.

## Overview

LLM client library: no HTTP server, no transport code. Consumed by `alpha-orchestrator`, `telegram-bot`, `cli` (Bun source import, `exports: ./src/index.ts`). Files in `src/` are flat and import without `.ts` extension (unlike the apps); `src/index.ts` is the public surface.

HTTP model calls go through the Vercel AI SDK: `ai`, `@ai-sdk/openai-compatible` (chat/reply model on `beta-text`), `@ai-sdk/typesafe-ai` (decision models via `experimental_decide`, talking to `gamma-decision`). Versions are pinned **exactly** in the root catalog because `experimental_*` APIs change in patch releases.

## Ports and adapters

- `Agent` (`agent.ts`, `createAgent`) — `handleMessage` / `resetThread`; text model.
- `DecisionAgent` (`decision-agent.ts`, `decision-types.ts`) — typed questions to `gamma-decision`.
- `FunctionCallAgent` (`function-call-agent.ts`) — json_schema-constrained argument filling on `delta-function-call`; helpers `repair-arguments.ts`, `validate-arguments.ts`, `ground-arguments.ts`.
- `HistoryStore` (`history.ts`), `ConcurrencyLimiter` + `withConcurrencyLimit` / `withDecisionConcurrencyLimit` (`concurrency-limiter.ts`) wrap agents, `withTimeout` (`timeout.ts`), `recordCall` (`record-call.ts`, single reporting path: telemetry line + `llm_calls` row), `telemetry.ts` (`logMessageEvent`/`logLlmState`, OpenTelemetry GenAI field names, JSON to stdout).

## GOAP (`src/goap/`)

`plan.ts` (planner, priority queue in `heap.ts`), `executor.ts` (`runPlan`, reconciles actual vs expected effects), `text-action.ts`, `decision-action.ts`, `webmcp-actions.ts`, `tool-source.ts` + `mcp-client.ts` (MCP-backed `ToolSource`), `world-state-store.ts`, `run-lock.ts`. `WorldState` is a flat key->value fact bag; actions declare preconditions/effects. Intent logic: `message-intent.ts`, `intent-taxonomy.ts`, `message-cues.ts`, `tool-cues.ts`, `intent-memory.ts` (shop-domain layer, see root "Domain"). Orchestrator-side wiring and the intent/translation pipeline: `apps/alpha-orchestrator/CLAUDE.md`.

Commands: `bun --cwd packages/core test`; evals `bun run eval:intents`, `eval:tools`, `bench:plan` (in `packages/core`, cases in `src/goap/intent-cases.ts`).

## Lessons

- **`createOpenAICompatible` needs `includeUsage: true`** — otherwise streamed token counts are `undefined` (it must send `stream_options: { include_usage: true }` to llama-server).
- **A failed GOAP run must not keep its full WorldState as checkpoint** — only a WAITING run keeps it; every other end keeps just `SESSION_FACTS` (stale `webmcp:*:result = "error"` once infected the next message). Enforced orchestrator-side.
- **IronClaw won't work with small local models** — ~15k token system prompt + 30s timeout. Use this custom core/adapter setup instead.
- Laya can't load in `llama-server`; see `apps/gamma-decision/CLAUDE.md`.
