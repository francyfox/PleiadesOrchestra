---
name: transferum
description: Use whenever writing or editing code that depends on the `transferum` npm package in this repo (e.g. `apps/harness`) — building data-transformation pipelines, normalization steps, reactive channels, polling, or debounce/throttle logic. Also load before adding a *new* transferum dependency elsewhere in the monorepo. Covers the right-sized pattern for pure synchronous transforms (operators only, no transfer graph) vs. when an actual transfer/bridge pipeline is warranted.
---

# transferum

`transferum` (npm: `transferum`, repo: `Smoren/transferum-ts`) is a zero-dependency,
type-safe **data transfer graph** library: **transfers** are nodes (push/pull/subscribe/poll/gate),
**bridges** are edges, **operators** are pure stateless transforms used inside transfers, and
**builders** (`CompositeTransferBuilder`) wire it all together with compile-time-checked contracts.

It is *not* a stream library like RxJS — there's no single `Observable` abstraction. Capabilities
(`isPushable`, `isPullable`, `isSubscribable`, `isGate`, `isPollingProxy`, ...) are composable flags;
a transfer's TypeScript type is computed from which flags it declares.

Full API reference (every transfer/operator/builder, linking-strategy table, error-handling
semantics): `references/api.md`. Read it before reaching for anything beyond the two patterns below —
don't guess constructor option names.

## Which pattern to use

**Most tasks in this repo are pure data transformation** (e.g. normalizing incoming text before it
hits the LLM). For that, you almost never need transfers/bridges/builders — just compose operators
directly and call `.apply()`. Reach for the full transfer-graph machinery only when the task genuinely
needs push/pull/subscribe semantics, polling, debounce/throttle, or multiple wired stages with independent
lifecycles (see decision table below).

### Pattern A — pure sync/async transform pipeline (operators only, no transfers)

This is the default for "transform this data" tasks. `PipelineOperator` / `AsyncPipelineOperator`
compose a list of `MapOperator`/`GuardOperator`/`AsyncMapOperator` steps into one callable. No
transfer graph, no lifecycle, no `destroy()` — just a function.

```typescript
import { createPipelineOperator, createMapOperator, createGuardOperator } from "transferum";

const normalizeText = createPipelineOperator<string, string>([
	createMapOperator((text: string) => text.normalize("NFC")),
	createMapOperator((text: string) => text.replace(/\p{Cc}/gu, "")), // strip control chars
	createMapOperator((text: string) => text.replace(/\s+/g, " ")),
	createMapOperator((text: string) => text.trim()),
]);

normalizeText.apply("  hi   there  "); // -> "hi there"
```

For async steps (e.g. a transform step that calls out to a DB or another service), use
`createAsyncPipelineOperator` + `createAsyncMapOperator` — sync `MapOperator` steps compose fine
inside an async pipeline, but not the reverse.

Test these the same way as any pure function — call `.apply()` / `await .apply()` and assert on the
result. No transferum-specific test setup needed. Per this repo's testing rule, only test the
transform logic you wrote (e.g. the regexes/normalization rules) — don't write a test asserting that
`MapOperator` calls its mapper, that's testing the library.

### Pattern B — transfer graph (push/pull/subscribe/poll/gate pipelines)

Reach for this only when the task needs one of: reactive push+subscribe notification, pull-based
polling, debounce/throttle timing, runtime-switchable routing (`BridgeSelector`), or multiple
independently-destroyable stages. Build it with `CompositeTransferBuilder`:

```typescript
import {
	CompositeTransferBuilder,
	createPushStoredChannelTransfer,
	createConvertTransfer,
	createMapOperator,
	createSinkTransfer,
} from "transferum";

const pipeline = CompositeTransferBuilder
	.start(createPushStoredChannelTransfer<string>())
	.to(createConvertTransfer<string, string>({ operator: createMapOperator((s) => s.trim()) }))
	.finish(createSinkTransfer<string>({ callback: (s) => console.log(s) }), { owned: true });

pipeline.push("  hi  "); // -> "hi"
pipeline.destroy(); // clean up owned resources
```

Rules of thumb from the library's own design (see `references/api.md` for the full invariant list):

- Every transfer you create and don't hand to a builder's `owned: true` must be `destroy()`d
  explicitly — no implicit cleanup.
- `undefined` never propagates through a transfer chain (it means "no data"); use `null` as an
  explicit empty marker if the pipeline needs to carry emptiness.
- Provide `onError` on any polling transfer in production — without it, a fetcher failure stops the
  ticker and surfaces as an uncaught exception / unhandled rejection, not a caught error.
- `linkTransfers` / builders pick the wiring strategy from capability flags, never from class names —
  don't reach for `instanceof` checks on transfers.

## Quick transfer cheat-sheet

| Need                                                | Transfer                                                   |
|------------------------------------------------------|--------------------------------------------------------------|
| Reactive channel, fire-and-forget                    | `PushChannelTransfer`                                        |
| Channel that also caches last value (push+pull+sub)  | `PushStoredChannelTransfer`                                  |
| Debounce (last value after pause)                    | `DebounceTransfer`                                            |
| Throttle (leading+trailing)                          | `ThrottleTransfer`                                             |
| Transform via an `Operator`                          | `ConvertTransfer` (sync) / `AsyncConvertTransfer` (async)     |
| Filter / conditional accept                          | `ConditionTransfer` / `AsyncConditionTransfer`                 |
| Terminal callback sink                               | `SinkTransfer` / `AsyncSinkTransfer`                           |
| Poll an external fetcher on a timer                  | `PollingSourceTransfer` / `AsyncPollingSourceTransfer`         |
| Merge multiple sources                               | `MergeTransfer`                                                |
| Broadcast to multiple targets                        | `SplitTransfer`                                                |
| Runtime-switchable routing                           | `BridgeSelector` / `BridgeMultiSelector` + `PassBridge`         |

Full comparison tables (all ~20 sync transfers, all ~10 async transfers, every capability flag) are
in `references/api.md`.

## Install

```bash
bun add transferum
```

Single entry point — everything is exported from `"transferum"`, no subpath imports.
