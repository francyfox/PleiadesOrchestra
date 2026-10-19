---
title: Writing a GOAP action
---

# Writing a GOAP action

A practical guide to `packages/core/src/goap/`. This page is about the mechanics: how to create an action and how it works under the hood.

## How to create an action

1. Decide which `WorldState` facts the action reads (`preconditions`) and which it produces (`effects`). They are key-value pairs, for example `{ catalogOpen: true }` or `{ filterSet: "price_asc" }`.
2. Write a function that returns a `GoapAction` object and put it next to the other actions (for example `apps/alpha-orchestrator/src/actions/`).
3. Register it in the catalog: add the call to `buildActions()` (`apps/alpha-orchestrator/src/modules/goap/goap.service.ts`).

A minimal working example, an action that opens the product catalog through WebMCP:

```ts
// apps/alpha-orchestrator/src/actions/open-catalog.ts
import type { ActionContext, GoapAction } from "@repo/core";
import type { WebMcpClient } from "../webmcp-client";

export function createOpenCatalogAction(webmcp: WebMcpClient): GoapAction {
  return {
    name: "openCatalog",
    cost: 1, // the real price of the call (latency/CPU), not an arbitrary number
    preconditions: {},
    effects: { catalogOpen: true },
    async execute(_ctx: ActionContext) {
      const result = await webmcp.callTool("catalog.open", {});
      return { catalogOpen: result.ok };
    },
  };
}
```

And the registration:

```ts
// apps/alpha-orchestrator/src/modules/goap/goap.service.ts, inside buildActions(agent, maxChunkChars)
function buildActions(agent: Agent, maxChunkChars: number): GoapAction[] {
  return [
    createTextAction({ /* ... the existing generateReply ... */ }),
    createOpenCatalogAction(deps.webmcp),
  ];
}
```

The planner (`plan()`) does not need the call order spelled out: it builds the chain itself from the actions' `preconditions`/`effects`, picking the cheapest (`cost`) sequence to the `goal`. The rest of this page explains why it works this way and what else actions can do.

## The model

- `WorldState` (`packages/core/src/goap/types.ts`) is a flat key-value bag of facts (`Record<string, boolean | number | string | undefined>`), not a graph.
- `Goal` is `Partial<WorldState>`: the subset of facts the planner tries to reach.
- `GoapAction` is the unit the planner understands:

```ts
interface GoapAction {
  name: string;
  cost: number; // real price (latency/CPU), not an arbitrary number
  preconditions: Partial<WorldState>;
  effects: Partial<WorldState>; // what the action PROMISES at planning time
  execute(ctx: ActionContext): Promise<Partial<WorldState>>; // what actually happened
}
```

`plan()` (`plan.ts`) runs a backward-chaining search from `goal` to `state` over `preconditions`/`effects`. It is plain STRIPS search, no model involved. `runPlan()` (`executor.ts`) executes the plan step by step and **compares** the promised `effects` with what `execute()` actually returned. If `execute()` returned something else, that is a reason to replan, not for the planner to lie to itself.

Important: `effects` is a planning-time promise ("after this action `filterSet` becomes `"price_asc"`"). What `execute()` really returns can differ (a tool error, a model refusal, a site that is down). The planner is not responsible for that; `runPlan` is.

## Three ways to get a `GoapAction`

| Way | When to use it |
| --- | --- |
| Write a `GoapAction` by hand (example above) | Deterministic business logic (HTTP call, WebMCP tool, pure function) |
| `createTextAction` (`text-action.ts`) | A step that must generate text through `Agent`/albedo |
| `createDecisionAction` (`decision-action.ts`) | A single typed question to Laya (choice/score/boolean) with a calibrated probability |
| `createMcpToolSource` (`tool-source.ts`) | Create actions automatically from a real MCP server's `tools/list`, with no hand-written config per tool |

## A bigger example: a chain of several actions

Scenario: "pick the cheapest laptop and put it in the cart". An action next to `openCatalog` sorts by price and needs the catalog to be open already:

```ts
export function createSetPriceFilterAction(webmcp: WebMcpClient): GoapAction {
  return {
    name: "setPriceFilterAsc",
    cost: 2,
    preconditions: { catalogOpen: true },
    effects: { filterSet: "price_asc" },
    async execute(ctx: ActionContext) {
      const result = await webmcp.callTool("catalog.setFilter", {
        sort: "price",
        order: "asc",
      });
      // The real outcome can differ from the promised effects: for example,
      // the site did not support sorting and fell back to its default.
      if (!result.ok) return { filterSet: undefined };
      return { filterSet: "price_asc" };
    },
  };
}
```

A third action reads the first item of the filtered list and puts it in the cart: `preconditions: { filterSet: "price_asc" }`, `effects: { inCart: true }`. For the goal `{ inCart: true }` the planner derives the chain `openCatalog → setPriceFilterAsc → addCheapestToCart` on its own, the same way `plan.test.ts` derives `classifyIntent → generateReply` from `generateReply` needing an `intent` that `classifyIntent` produces without needing anything.

## `ActionContext`

`execute(ctx)` gets the `BaseContext` (what the caller passed in `runPlan({ ctx })`: `threadId`, HTTP clients and so on) plus the live `state`. Not the `state` the run started with, but the one in place when this particular action runs (earlier steps' effects already applied). `plan()` never sees or touches this `state`; only `execute()` does.

## Testing

Actions are unit-tested next to their file (`*.test.ts`, `bun test`) without the real planner. See `plan.test.ts` for the fixture pattern (`execute: async () => ({})`, since `plan()` never calls it) and `decision-action.test.ts`/`text-action.test.ts` for testing `execute()` itself with fake ports (`DecisionAgent`/`Agent`).

## Registering in the catalog

Actions are built once per app instance, not per request: see `buildActions()` in `apps/alpha-orchestrator/src/modules/goap/goap.service.ts`. A new action goes there (or into a separate `buildWebMcpActions()` that `buildActions()` concatenates), not created again on every `/v1/messages` call.

---

> `docs/harness-goap-orchestrator-plan.md`, which the root CLAUDE.md used to point to, was deleted by accident in commit `0bfd211`. This page does not replace it fully, only its practical part about writing actions.
