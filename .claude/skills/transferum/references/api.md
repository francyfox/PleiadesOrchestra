# transferum API reference

Condensed from the `Smoren/transferum-ts` README (npm: `transferum`, MIT license). Full docs:
https://smoren.github.io/transferum-ts — source of truth if something here is ambiguous or a config
option isn't listed.

Single import surface — everything comes from `"transferum"`, no subpath imports.

## Core model

- **Transfer** — a node. Declares capabilities via boolean flags (`isPushable`, `isPullable`,
  `isSubscribable`, `isTriggerable`, `isGate`, `isPollingSource`, `isPollingProxy`, plus async
  equivalents `isAsyncPushable`/`isAsyncPullable`/`isAsyncTriggerable`/`isAsyncPollingProxy`). A flag
  being `true` is a compile-time guarantee the corresponding method exists on that transfer's type —
  no casts needed.
- **Bridge** — an edge. Connects an output transfer to an input transfer, with its own gate
  (`activate()`/`deactivate()`/`toggle()`).
- **Operator** — a pure, stateless transform (`apply(input) → output`, or `Promise<output>` for
  async). Lives *inside* a transfer (`ConvertTransfer`, `TransformBridge`), not as a standalone node.
- **Builder** (`CompositeTransferBuilder`) — fluent assembly of a transfer chain with compile-time
  capability checking and automatic linking.

**Invariants worth knowing before writing new code here:**

- Transfers never reference each other's class — only capability flags matter. Don't write
  `instanceof` checks against transfer classes.
- `undefined` never propagates through a chain (means "no data"). Use `null` for an explicit empty
  value if the type needs to carry emptiness.
- Every transfer/bridge/subscription-manager has an explicit `destroy()`; tickers have `stop()`;
  subscriptions have `unsubscribe()`. Nothing cleans up implicitly. `CompositeTransferBuilder`'s
  `owned: true` option destroys that stage when the composite pipeline is destroyed.
- Errors are **local and non-fatal by default when `onError` is given** (suppressed, pipeline
  continues); **without `onError` they're rethrown/unhandled-rejected**, and for polling transfers
  that additionally **stops the ticker** (fail-safe, not silent). See "Error handling" below —
  always pass `onError` on polling transfers used outside tests.

## Linking (`linkTransfers(lhs, rhs, options?)`)

Connects an output transfer (LHS) to an input transfer (RHS) by inspecting flags, not classes.
Returns a `SubscriberInterface` (`.unsubscribe()` breaks the link).

| LHS               | RHS                    | Strategy                                                  |
|--------------------|------------------------|-------------------------------------------------------------|
| `isSubscribable`   | `isPushable`           | Reactive subscription                                       |
| `isPullable`       | `isPollingProxy`       | Active polling via `setFetcher`                              |
| `isSubscribable`   | `isPollingProxy`       | Subscription + last-value buffering for the poller           |
| `isSubscribable`   | `isAsyncPushable`      | Subscription + `asyncPush` with `.catch()`, no ordering guarantee |
| `isAsyncPullable`  | `isAsyncPollingProxy`  | Active async polling via `setAsyncFetcher`                   |
| `isPullable`       | `isAsyncPollingProxy`  | Sync-pull wrapped in async fetcher                            |
| `isSubscribable`   | `isAsyncPollingProxy`  | Subscription + buffer + async fetcher                        |
| `isAsyncPullable`  | `isPollingProxy`       | **Error** — sync poller can't `await`                        |
| pullable/asyncPullable | pushable/asyncPushable | **Error** — needs a Bridge or Triggerable adapter        |
| other              | other                  | **Error** — unsupported combination                          |

Sync linking is always preferred over async when both are possible. Pass a custom
`LinkStrategyInterface` (`{ link(lhs, rhs, options?) }`) to `CompositeTransferBuilder.start(transfer, { linkStrategy })`
to override wiring for an entire chain (logging, validation, custom serialization, etc.) —
`DefaultLinkStrategy` (the zero-config default) just delegates to `linkTransfers()`.

## Error handling

```typescript
type ErrorHandler<TSource> = (e: Error, source: TSource) => void;
function handleError<TSource>(error: unknown, source: TSource, onError?: ErrorHandler<TSource>): void;
```

- `onError` provided and returns normally → exception suppressed, operation continues.
- `onError` **not** provided → exception rethrown (or unhandled rejection for async paths).
- `onError` provided but itself throws → that exception rethrown (handler is "broken").

Most transfers take one `onError`. Exceptions: `ConditionTransfer`/`AsyncConditionTransfer` split
into `onAcceptError` (for `shouldAccept`) and `onEmitError` (for `shouldEmit`);
`ChannelTransfer`/`StoredChannelTransfer`/`AsyncStoredChannelTransfer` split `onError` (covers
`emit()`) from `onDestroyError` (covers `destroy()`) — `setup()` errors are **always** rethrown
(a failed setup means the transfer is unusable).

**Polling transfers specifically:** a fetcher failure inside `trigger()`/`asyncTrigger()` (called by
the ticker, fire-and-forget) — if unhandled, rethrows/rejects **and stops the ticker**, surfacing as
an uncaught exception or unhandled rejection. The same failure inside `pull()`/`asyncPull()` (called
directly by you) just propagates to your `try`/`catch` or `await` — the ticker keeps running. Always
pass `onError` on polling transfers used outside tests.

## Sync transfers

All extend `BaseStateTransfer<T>` except `SplitTransfer`, `WriteTransfer`, `ReadTransfer` (direct
`BaseTransfer`) and `UniversalCompositeTransfer` (its own hierarchy — flags computed from the
`input`/`output` transfers it wraps).

| Transfer                     | Push | Pull | Sub | Trig | Gate | Poll    | In | Out | Purpose                                              |
|-------------------------------|:----:|:----:|:---:|:----:|:----:|:-------:|:--:|:---:|--------------------------------------------------------|
| `PushChannelTransfer`         | ✓   | —    | ✓  | —    | —    | —       | ✓ | ✓  | Reactive channel, data not retained after emission      |
| `DelayedPushChannelTransfer`  | ✓   | —    | ✓  | —    | —    | —       | ✓ | ✓  | Channel, delayed emission (own timer per `push()`)      |
| `DebounceTransfer`            | ✓   | —    | ✓  | —    | —    | —       | ✓ | ✓  | Channel, emits last value after a pause                |
| `ThrottleTransfer`            | ✓   | —    | ✓  | —    | —    | —       | ✓ | ✓  | Channel, leading+trailing emission on interval          |
| `PushStoredChannelTransfer`   | ✓   | ✓   | ✓  | ✓   | —    | —       | ✓ | ✓  | Channel with last-value caching                        |
| `BufferTransfer`              | ✓   | ✓   | —   | —    | —    | —       | ✓ | ✓  | Passive buffer, no notifications                        |
| `ManualBufferTransfer`        | ✓   | ✓   | —   | ✓   | —    | —       | ✓ | ✓  | Buffer, readable only after `trigger()`                |
| `ManualFlowTransfer`          | ✓   | —    | ✓  | ✓   | —    | —       | ✓ | ✓  | Emits to subscribers only on `trigger()`                |
| `GateTransfer`                | ✓   | —    | ✓  | —    | ✓   | —       | ✓ | ✓  | Flow blocking by `active` state                         |
| `MergeTransfer`               | —    | —    | ✓  | —    | —    | —       | —  | ✓  | Merges multiple sources into one                        |
| `SplitTransfer`               | ✓   | —    | —   | —    | —    | —       | ✓ | —   | Broadcasts push to multiple targets                     |
| `PollingSourceTransfer`       | —    | ✓   | ✓  | ✓   | ✓   | Src     | —  | ✓  | Polls an external `fetcher` on a timer                  |
| `PollingProxyTransfer`        | —    | ✓   | ✓  | ✓   | ✓   | Src+Prx | ✓ | ✓  | Polls the previous node in the chain                    |
| `PollingFlowTransfer`         | —    | ✓   | ✓  | ✓   | ✓   | Src     | —  | ✓  | Polls from a `Storage`'s `OutputFlowInterface`          |
| `IdlePollingTransfer`         | ✓   | ✓   | ✓  | ✓   | ✓   | Src     | ✓ | ✓  | Falls back to polling when incoming data goes idle      |
| `ChannelTransfer`             | —    | —    | ✓  | —    | —    | —       | —  | ✓  | External source via `setup`/`destroy` callbacks         |
| `StoredChannelTransfer`       | —    | ✓   | ✓  | ✓   | —    | —       | —  | ✓  | Channel + storage + external source                     |
| `SinkTransfer`                | ✓   | —    | —   | —    | —    | —       | ✓ | —   | Terminal sink (callback)                                 |
| `WriteTransfer`               | ✓   | —    | —   | —    | —    | —       | ✓ | —   | Writes to a `Storage`'s `InputFlowInterface`             |
| `ReadTransfer`                | —    | ✓   | —   | —    | —    | —       | —  | ✓  | Reads from a `Storage`'s `OutputFlowInterface`           |
| `ConvertTransfer`             | ✓   | —    | ✓  | —    | —    | —       | ✓ | ✓  | Transforms via an `Operator`                             |
| `ConditionTransfer`           | ✓   | —    | ✓  | —    | —    | —       | ✓ | ✓  | Conditional filter (`shouldAccept`/`shouldEmit`)         |
| `DisplaceTransfer`            | ✓   | —    | ✓  | —    | —    | —       | ✓ | ✓  | Switch-map: new inner transfer per value, old displaced  |

## Async transfers

Async subscription is always synchronous — `subscribe()` notifies synchronously even when data
arrived via `asyncPush`/`asyncPull`/`asyncTrigger`. Four support backpressure (BP column):
`AsyncSinkTransfer`, `AsyncWriteTransfer`, `AsyncConvertTransfer`, `AsyncConditionTransfer` — optional
`maxConcurrency`, `bufferSize`, `onBufferOverflow` (default unlimited). Those two plus
`AsyncSinkTransfer`/`AsyncWriteTransfer` also support `ordered: true` for sequential callback
execution regardless of individual async duration; `AsyncConvertTransfer`/`AsyncConditionTransfer`
auto-enforce ordering when `maxConcurrency > 1`.

| Transfer                     | aPush | aPull | aTrig | Sub | Gate | Poll     | In | Out | BP  | Purpose                                                     |
|-------------------------------|:-----:|:-----:|:-----:|:---:|:----:|:--------:|:--:|:---:|:---:|----------------------------------------------------------------|
| `AsyncSinkTransfer`           | ✓    | —     | —     | —   | —    | —        | ✓ | —   | ✓  | Async terminal sink (callback)                                 |
| `AsyncWriteTransfer`          | ✓    | —     | —     | —   | —    | —        | ✓ | —   | ✓  | Async write to storage                                         |
| `AsyncReadTransfer`           | —     | ✓    | —     | —   | —    | —        | —  | ✓  | —   | Async read from storage                                        |
| `AsyncConvertTransfer`        | ✓    | —     | —     | ✓  | —    | —        | ✓ | ✓  | ✓  | Async transform via `AsyncOperator`                             |
| `AsyncConditionTransfer`      | ✓    | —     | —     | ✓  | —    | —        | ✓ | ✓  | ✓  | Async conditional filter                                        |
| `AsyncPollingSourceTransfer`  | —     | ✓    | ✓    | ✓  | ✓   | Src      | —  | ✓  | —   | Async poll of an external `fetcher` on a timer                  |
| `AsyncPollingProxyTransfer`   | —     | ✓    | ✓    | ✓  | ✓   | Src+aPrx | ✓ | ✓  | —   | Async poll of the previous node in the chain                    |
| `AsyncPollingFlowTransfer`    | —     | ✓    | ✓    | ✓  | ✓   | Src      | —  | ✓  | —   | Async poll from storage                                         |
| `AsyncIdlePollingTransfer`    | ✓*    | ✓    | ✓    | ✓  | ✓   | Src      | ✓ | ✓  | —   | Fallback async polling on idle (`✓*` = sync `push`, async fetcher) |
| `AsyncStoredChannelTransfer`  | —     | ✓    | ✓    | ✓  | —    | —        | —  | ✓  | —   | Channel + storage + external source, async interface            |

## Operators

`OperatorInterface<TIn, TOut>.apply(data) → TOut`; async variant returns `Promise<TOut>`.

| Operator                          | Input | Output                   | Behavior                                             |
|-------------------------------------|-------|-----------------------------|---------------------------------------------------------|
| `TransparentOperator<T>`            | `T`   | `T`                          | Identity — stub / pipeline testing                       |
| `MapOperator<TIn, TOut>`            | `TIn` | `TOut`                       | Applies a mapper function                                |
| `FilterOperator<T>`                 | `T[]` | `T[]`                        | Keeps array elements matching a predicate                |
| `ReducerOperator<T>`                | `T[]` | `T \| undefined`             | Reduces an array to one value                             |
| `GuardOperator<T>`                  | `T`   | `T \| undefined`             | Passes if predicate true, else `undefined`                |
| `PipelineOperator<TIn, TOut>`       | `TIn` | `TOut`                       | Sequentially applies a chain of operators                 |
| `AsyncMapOperator<TIn, TOut>`       | `TIn` | `Promise<TOut>`              | Async mapper (mapper itself may be sync or async)          |
| `AsyncGuardOperator<T>`             | `T`   | `Promise<T \| undefined>`    | Async guard                                                |
| `AsyncPipelineOperator<TIn, TOut>`  | `TIn` | `Promise<TOut>`              | Sequential chain of sync/async operators via `await`       |

`PipelineOperator`/`AsyncPipelineOperator` do **not** short-circuit on `undefined` from a
`GuardOperator` step — `undefined` is passed through to the next step, not treated as "stop the
chain." A sync operator inside an `AsyncPipelineOperator` is unwrapped as a no-op await.

```typescript
import { createPipelineOperator, createMapOperator, createGuardOperator } from "transferum";

const op = createPipelineOperator<number, string>([
	createMapOperator((n: number) => n * 2),
	createMapOperator((n: number) => n.toString()),
	createGuardOperator((s: string) => s.length > 0),
]);

op.apply(21); // "42"
```

## Storages

`StorageInterface<TIn, TOut>`: `write()` / `read()` / `clear()` / `reset()` / `size`.

| Storage             | Structure     | Read order                  | `maxLength`             | `reset()`                | Use for                     |
|-----------------------|---------------|--------------------------------|:--------------------------:|-----------------------------|--------------------------------|
| `LatestStorage<T>`    | Single value  | Last written                    | —                          | Restores `defaultValue`     | Last-value cache                |
| `QueueStorage<T>`     | Array (FIFO)  | First written -> first read     | ✓ (evicts oldest)          | Clears                       | FIFO buffer with a size limit   |
| `StackStorage<T>`     | Array (LIFO)  | Last written -> first read      | ✓ (evicts from bottom)     | Clears                       | LIFO stack with a size limit    |

`ReadTransfer` pulls from any storage's `OutputFlowInterface`; `WriteTransfer` writes to its
`InputFlowInterface`; `PollingFlowTransfer`/`AsyncPollingFlowTransfer` poll one on a timer.

## Tickers

Drive polling transfers. `TickerInterface`: `interval`, `active`, `start()`, `stop()`, `restart()`,
`toggle()`, `updateInterval(delay)`. Both invoke the callback immediately on `start()`.

| Ticker            | Based on                 | Use in                                |
|--------------------|---------------------------|-------------------------------------------|
| `RAFTicker`        | `requestAnimationFrame`   | Browser / SSR (falls back to `setTimeout`) |
| `IntervalTicker`   | `setInterval`             | Node.js / Bun / tests with fake timers      |

`RAFTicker` recalculates its internal start time before invoking the callback, so the callback may
safely call `stop()` synchronously without the frame rescheduling.

## Bridges

`BridgeInterface`: `active`, `activate()`, `deactivate()`, `toggle()`, `destroy()`,
`onStateChange(handler)`. Every bridge has an internal `GateTransfer` for flow control.

| Bridge                            | Connects                   | Transforms          | Intermediate transfer                       | Owned |
|--------------------------------------|-----------------------------|:----------------------:|-------------------------------------------------|:-------:|
| `PassBridge<T>`                      | Output -> Input             | —                       | —                                                | —      |
| `TransformBridge<TIn, TOut>`         | Output -> Input             | ✓ via `Operator`       | `ConvertTransfer` (internal)                     | —      |
| `TransferBridge<TIn, TOut>`          | Output -> Input             | Depends on middle       | External `DuplexTransfer` (`middleOwned` controls) | ✓     |
| `AsyncTransformBridge<TIn, TOut>`    | Output -> Input             | ✓ via `AsyncOperator`  | `AsyncConvertTransfer` (internal)                | —      |
| `BridgeAggregator`                   | Group of bridges            | —                       | —                                                | ✓     |
| `BridgeSelector<TMap>`               | One bridge from a map       | —                       | —                                                | ✓     |
| `BridgeMultiSelector<TMap>`          | Several bridges from a map  | —                       | —                                                | ✓     |

`BridgeSelector`/`BridgeMultiSelector` accept `syncWithChildren?: boolean` (default `false`) — when
`true`, external `activate()`/`deactivate()` calls on a child bridge update the selector's own
selection and fire its `onStateChange()`, and vice versa (an internal `_syncing` guard prevents
feedback loops).

```typescript
import { createBridgeSelector, createPassBridge } from "transferum";

const selector = createBridgeSelector({
	bridges: {
		fast: createPassBridge({ source, target: target1, activated: false }),
		slow: createPassBridge({ source, target: target2, activated: false }),
	},
	initialKey: "fast",
	activated: true,
	owned: false,
});

selector.select("slow");
```

## CompositeTransferBuilder

The one builder to use — replaces the deprecated `InputPipelineBuilder` / `OutputPipelineBuilder` /
`DuplexPipelineBuilder` and their async variants.

**Pipeline shape:** `OutputTransfer [-> DuplexTransfer -> ...] -> InputTransfer`

```typescript
CompositeTransferBuilder.start(startTransfer, options?)
// options?: { linkStrategy?: LinkStrategyInterface }  — default: DefaultLinkStrategy

.to(nextTransfer, {
  owned?: boolean,             // destroy nextTransfer when the composite is destroyed
  onLinkError?: ErrorHandler,  // handles async-linking errors for this stage
})

.finish(lastTransfer, {
  triggerable?: TriggerableInterface,
  asyncTriggerable?: AsyncTriggerableInterface,
  gate?: GateInterface,
  owned?: boolean,
  onLinkError?: ErrorHandler,
})
```

- Input capabilities (`Pushable`/`PollingProxy`/`AsyncPushable`/`AsyncPollingProxy`) are inferred
  from the **start** transfer; output capabilities (`Pullable`/`Subscribable`/`AsyncPullable`) from
  the **finish** transfer. `Triggerable`/`AsyncTriggerable`/`Gate` are auto-extracted from the chain
  unless given explicitly in `finish()`.
- `onLinkError` on `to()`/`finish()` is what makes one builder cover both sync and async chains —
  no separate async builder classes needed.

```typescript
const pipeline = CompositeTransferBuilder
	.start(createPushStoredChannelTransfer<number>())
	.to(createConditionTransfer<number>({ shouldAccept: (x) => x > 0 }))
	.finish(createSinkTransfer<number>({ callback: console.log }), { owned: true });

pipeline.push(42); // -> 42
pipeline.destroy(); // destroys owned resources
```

## Utilities / guards (exported, no separate docs needed beyond signatures)

- `linkTransfers(lhs, rhs, options?)`, `linkSubscribableToPushable`, `linkPullableToPollingProxy`,
  `linkSubscribableToPollingProxy`, `linkSubscribableToAsyncPushable`,
  `linkAsyncPullableToAsyncPollingProxy`, `linkPullableToAsyncPollingProxy`,
  `linkSubscribableToAsyncPollingProxy`, `handleError`.
- Type guards: `isPushable`, `isPullable`, `isSubscribable`, `isPollingProxy`, `isTriggerable`,
  `isGate`, `isAsyncPushable`, `isAsyncPullable`, `isAsyncPollingProxy`, `isAsyncTriggerable` — runtime
  checks that narrow to the corresponding capability interface.
- Every transfer/operator/storage/ticker/bridge has a `create*` factory function
  (`createPushChannelTransfer`, `createConvertTransfer`, `createMapOperator`,
  `createQueueStorage`, `createPassBridge`, ...) — prefer factories over `new ClassName()` for
  consistency with the rest of the codebase and the README's own examples.

## Install

```bash
bun add transferum
```
