---
title: Laya autopilot for any WebMCP
---

# Laya autopilot for any WebMCP

A design note: how to bring Laya to Jev-level autonomy on **any** WebMCP catalog, without a hand-written action per tool per shop, and without losing what GOAP is for in the first place (a graph of actions, not a black box). It continues [Writing a GOAP action](/docs/drafts/goap-actions/): read that first, the basic `WorldState`/`GoapAction`/`plan`/`runPlan` model is not repeated here.

## WebMCP vs MCP: where a tool call actually runs

Decided 2026-09-29 (the session about the widget's stop button, offline mode and restyle): these are **two different transports**, not one tool catalog reachable two ways.

- **MCP**: the site's tools are reachable through a real MCP server (stdio/SSE) that `alpha-orchestrator` itself connects to. Everything this note proposes (`createClassifiedMcpToolSource`, `McpClient`, classification while the catalog is built) is about this case. The server decides which tool to call and calls it; the GOAP planner sees the real graph.
- **WebMCP**: the tools exist only in the visitor's browser, through `navigator.modelContext` on the page where the widget is embedded. Here **the tool call runs in the browser, by the widget itself** (`navigator.modelContext.callTool(...)`), not through a relay on the server. So the `McpClient`/`createClassifiedMcpToolSource` design of this note does not cover WebMCP as is; it is implemented separately as `createWebMcpActions` (`packages/core/src/goap/webmcp-actions.ts`), see the next section.

## WebMCP: round trip with the browser

Implemented 2026-09-29. The question was "the server decided a browser tool is needed; how does the result get back into the same run?" A single HTTP NDJSON stream cannot be bidirectional. The answer is **WAITING plus a new request**, the same principle Embabel calls the `WAITING` state of an agent process: the run neither fails nor hangs, it saves a checkpoint and waits for the next HTTP request carrying the result.

- **`WaitingOn`** (`packages/core/src/goap/types.ts`) is a new outcome of `GoapAction.execute()`: `Promise<Partial<WorldState> | { waiting: WaitingOn }>`. An action that cannot finish on the server returns `{ waiting: { kind, payload } }` instead of effects. `executor.ts` stops the run at once (no exception, not counted as `killed`/`no_plan`; it is a separate `RunPlanResult.waiting` field) and emits a `PlanTraceEvent` of type `"waiting"`.
- **`createWebMcpActions`** (`packages/core/src/goap/webmcp-actions.ts`) turns a tool list into `GoapAction[]`: it classifies each tool once through a Laya `choice` (`TOOL_INTENTS`/`EFFECTS_BY_INTENT`/`PRECONDITIONS_BY_INTENT` in `intent-taxonomy.ts`, the same taxonomy proposed for `createClassifiedMcpToolSource` below). `execute()` **never calls anything itself**: if `ctx.state["webmcp:<name>:result"]` is already there (the browser answered and it was written on resume) it returns the real effects; otherwise `{ waiting: { kind: "webmcp_tool_call", payload: { tool, arguments } } }`. It runs not per request but once per catalog registration (`POST /v1/widget/tools`, see below), and the result is cached by `threadId`.
- **`WorldStateCheckpoint`** (`packages/core/src/goap/world-state-store.ts`): the store now keeps not only the `state` but also the run's `goal` (`thread_world_state.goal`, migration `0005_thread_world_state_goal`). Resuming must continue **the same** goal instead of classifying the original message again (Laya is not guaranteed to be deterministic).
- **Protocol** (`apps/alpha-orchestrator`; the full contract is in [Admin API](/docs/drafts/admin-api/)): the NDJSON stream gets a terminal `tool_call` line (instead of `done`/`error`) with `tool`/`arguments`/`callId`. The new endpoint `POST /v1/widget/tool-results` resumes the run: it merges `webmcp:<tool>:result = "ok"|"error"` into the checkpoint and calls `runPlan` again with the same `goal`, up to one more `tool_call` if the plan needs a second call in a row.
- **Widget** (`packages/pleiades-widget`): `lib/webmcp.ts`'s `WebMcpProvider` is a narrow abstraction over `navigator.modelContext`/`document.modelContext` (best effort, the API is unstable, see below) rather than the implementation itself, so that `chat.ts` and its tests do not depend on a browser API that `bun test` does not have. `chat.ts`'s `readReply` became a loop: on `tool_call` it calls `webmcp.callTool(...)`, then continues through `api.sendToolResult(...)` on a new stream. With no provider at all (today, any real browser), `syncWebMcpTools` makes no network call: nothing to register, nothing to clean.

**The tool catalog is registered once when the panel opens, not with every message (found and fixed 2026-09-29).** The first version sent `webmcpTools` with *every* `/v1/widget/messages`/`/v1/widget/tool-results`. With a real catalog (the `apps/shopping-cart-webmcp` demo has 15 tools with real descriptions and schemas; the `definitions.js` bodies alone are 13+ kB) this (a) failed with `413` on the very first message, since `WIDGET_MAX_TEXT_CHARS` is sized for short chat text, not a tool catalog, and (b) re-ran the Laya classification on every message, extra load that went unnoticed because of (a). Fix: `chat.ts`'s `syncWebMcpTools()` calls `api.registerWebMcpTools(...)` → `POST /v1/widget/tools` once at the end of `open()` (the panel opened) and again from `setToolMode()` (the mode switched while the panel is open), not from `send()`. The server (`server.ts`'s `registerWebMcpTools`, `webmcpCatalog: Map<threadId, GoapAction[]>` in `ServerDeps`, in process memory: lost on restart, the widget just registers again next time it opens) classifies and caches by `threadId`; `resolveDynamicActions` takes the ready list from the cache instead of a request parameter. `/v1/widget/messages`/`/v1/widget/tool-results` no longer accept the catalog at all. A separate limit, `WIDGET_MAX_WEBMCP_TOOLS_CHARS` (20000 by default, much larger than `WIDGET_MAX_TEXT_CHARS`): registration is one-off and can afford to be bigger.

**The first version of `createNavigatorWebMcpProvider` did not work at all (found and fixed 2026-09-29).** The real API surface is `document.modelContext.getTools()` (async, re-read on every call: tools come and go with the page's state) and **`executeTool(tool, argsJson)`**, which takes **the tool object itself** (not just its name) and a **JSON string** of arguments, and answers with a JSON string or an already parsed MCP object. There is no `callTool(name, args)`. The first version guessed exactly that signature and feature-detected on it, so `createNavigatorWebMcpProvider` **always** returned `undefined`, even with a fully working `document.modelContext`: WebMCP silently did not work at all. Confirmed empirically from working caller code in `apps/shopping-cart-webmcp/skills/grocery-staples/scripts/webmcp-bridge.js` (a real client calling `context.getTools()`/`context.executeTool(tool, JSON.stringify(args))`) and from the `use-webmcp-tool` README (the registration side, `document.modelContext.registerTool`: the other direction, not what a caller needs). `document.modelContext` is not a native browser API: "typically injected by a browser extension" (same README). Plain Chromium/Chrome without such an extension does not create it, confirmed for both Playwright's bundled Chromium and the system `google-chrome-stable` (see below).

**E2E regression: `apps/e2e`** (Playwright, `bunx playwright test`, a separate `bun run test:e2e` at the root; not part of the usual `bun run test`; needs `bunx playwright install chromium` once, like `test:beta-text`). `bun:test` has no DOM, so it could not catch this bug: the whole `WebMcpProvider` round trip there is tested with fakes that themselves guessed the right shape (see `webmcp.test.ts`, added with the fix). `apps/e2e/tests/webmcp.spec.ts` instead runs the real widget (`packages/pleiades-widget/dist/pleiades-widget.js`, the built bundle) in a real browser (`channel: "chrome"`, the system one, not a separate Chromium download), injecting through `page.addInitScript()` a `document.modelContext` with the exact real shape (`getTools`/`executeTool`), i.e. it emulates the extension, not WebMCP as such. Checked by hand (fix disabled → all three tests fail exactly where the bug is caught; fix enabled → all three pass): the test really catches this regression, it is not green by accident.

## Why not just write an action per tool

The example in [Writing a GOAP action](/docs/drafts/goap-actions/) (`createSetPriceFilterAction`, hard-calling `webmcp.callTool("catalog.setFilter", ...)`) works for one site with one set of tools. Another shop may call it `products.sort`, a third may have no sorting at all. An action per tool per shop does not scale, and `plan()` cannot work out "open the catalog before filtering" by itself, because an MCP tool descriptor carries no dependency semantics, only `name`/`description`/`inputSchema` (see `McpToolDescriptor` in `tool-source.ts`). That is what an LLM agent such as Jev usually decides for us: it reads tool descriptions in natural language and *reasons* about what to call next. Laya cannot reason: it only answers a **typed** question with options listed up front (`choice`/`score`/`boolean`, `packages/core/src/decision-types.ts`), no free generation and no step-by-step planning.

## Rejected option: one "autopilot" action

The first version of this note proposed one universal `GoapAction` that, inside `execute()`, on every iteration of `runPlan`'s replanning, asked Laya "which tool next" over a live `listTools()`, with `effects: goal` (the promise equals the goal itself, so `plan()` trivially picks this single action). It would work, but it kills the point of GOAP:

- **The graph disappears.** `plan()` sees one action for any goal; the real tool sequence is hidden inside `execute()`, invisible to the planner.
- **`cost` stops meaning anything.** The point of the GOAP model is that the planner compares the price of paths (cheap Laya vs expensive albedo). One action with one static `cost` cannot compare options inside the shopping trip itself.
- **Tracing degrades.** `PlanTraceEvent` would show the same `action_started` N times in a row instead of the real chain `openCatalog → setFilter → addToCart`.
- **It cannot be mixed** with ordinary Laya/text actions in one plan.

## The right split: Laya classifies the catalog, it does not orchestrate steps

Instead of asking Laya "what next" at every execution step, we ask it **once per tool, while building the catalog**, which of a small fixed set of e-commerce categories the tool belongs to. That is exactly the bounded task Laya solves with calibration (a ready list of options, not open reasoning), not the thing it is unfit for. The classification result is real `preconditions`/`effects`, from which `plan()` builds a real graph for any shop, with no line specific to a particular site.

```ts
// packages/core/src/goap/webmcp-tool-classifier.ts (proposal, not implemented)
import type { DecisionAgent } from "../decision-types";
import type { ActionContext, GoapAction, WorldState } from "./types";
import type { McpClient, McpToolDescriptor, ToolSource } from "./tool-source";

const TOOL_INTENTS = [
  "search",
  "filter",
  "select",
  "addToCart",
  "removeFromCart",
  "checkout",
  "paginate",
  "compare",
  "other",
] as const;
type ToolIntent = (typeof TOOL_INTENTS)[number];

/** The single place the "shop" domain semantics live: not in the tools, not in Laya. */
const EFFECTS_BY_INTENT: Record<ToolIntent, Partial<WorldState>> = {
  search: { catalogSearched: true },
  filter: { catalogFiltered: true },
  select: { itemSelected: true },
  addToCart: { inCart: true },
  removeFromCart: { inCart: false },
  checkout: { checkoutComplete: true },
  paginate: {},
  compare: {},
  other: {},
};

/** Ordering heuristic: best effort, not a guarantee (see "Limitations" below). */
const PRECONDITIONS_BY_INTENT: Record<ToolIntent, Partial<WorldState>> = {
  search: {},
  filter: { catalogSearched: true },
  select: {},
  addToCart: { itemSelected: true },
  removeFromCart: {},
  checkout: { inCart: true },
  paginate: {},
  compare: {},
  other: {},
};

export interface ClassifiedMcpToolSourceConfig {
  client: McpClient;
  decisionAgent: DecisionAgent;
  costFor?: (tool: McpToolDescriptor) => number;
}

/**
 * Like `createMcpToolSource`, but every tool gets meaningful
 * preconditions/effects through one Laya `choice` call per tool (not per plan
 * step) instead of the generic `{ toolResult:<name>: true }`.
 */
export function createClassifiedMcpToolSource(
  config: ClassifiedMcpToolSourceConfig,
): ToolSource {
  const costFor = config.costFor ?? (() => 3);

  return {
    async listActions() {
      const { tools } = await config.client.listTools();

      return Promise.all(
        tools.map(async (tool): Promise<GoapAction> => {
          const answers = await config.decisionAgent.decide(
            { name: tool.name, description: tool.description ?? "" },
            {
              intent: {
                type: "choice",
                instructions:
                  "Which e-commerce action does this tool most likely perform?",
                criteria: TOOL_INTENTS,
              },
            },
          );
          const intent =
            answers.intent?.type === "choice"
              ? (answers.intent.choice as ToolIntent)
              : "other";

          return {
            name: tool.name,
            cost: costFor(tool),
            preconditions: PRECONDITIONS_BY_INTENT[intent],
            effects: {
              ...EFFECTS_BY_INTENT[intent],
              [`toolResult:${tool.name}`]: true,
            },
            async execute(ctx: ActionContext) {
              const args = buildArguments(ctx.state, tool.inputSchema); // as in tool-source.ts
              const result = await config.client.callTool({
                name: tool.name,
                arguments: args,
              });
              if (result.isError) return { [`toolResult:${tool.name}`]: false };
              return {
                ...EFFECTS_BY_INTENT[intent],
                [`toolResult:${tool.name}`]: true,
              };
            },
          };
        }),
      );
    },
  };
}
```

Classification runs once when the catalog is built (or when the site's tool list changes), not at every plan step: cheap, cached by `name`+`description`. After that these are ordinary `GoapAction`s, no different from the hand-written ones: `plan()` builds a real backward-chaining graph for them mixed with Laya/text actions, `runPlan` executes them and replans on the facts, the tracer sees the real tool sequence.

## Priority: not every message is a task

The user does not have to start with "pick ingredients for scrambled eggs"; the first message may well be "hi". Since GOAP sees only the `goal` (a flat set of facts), not the text, someone must decide *before* `runPlan` which `goal` is needed this time: the plain `{ replied: true }`, or that plus a fact that really needs a WebMCP/MCP tool.

This is another Laya classification, but not the one from the previous section (there the **tool** is classified, once, when the catalog is built). This one is over the **message**, every turn: `classifyMessageIntent` (`packages/core/src/goap/message-intent.ts`) asks one `choice` question with `"chat"` plus all of `TOOL_INTENTS` as options (`packages/core/src/goap/intent-taxonomy.ts`, shared with the tool classifier) and returns `"chat"` by default if Laya answered something outside the list. The result becomes a `goal` through `goalForIntent`: `"chat"` leaves the base goal as is; any other intent adds `EFFECTS_BY_INTENT[intent]` (for example `{ inCart: true }` for `"addToCart"`), but **only if at least one action of the current catalog can produce that fact at all**. Otherwise `plan()` would get an unreachable goal and fail with `"no plan reached the goal"` for nothing, although the fault is not the user's but that no WebMCP tools are connected for this thread yet.

Implemented in `apps/alpha-orchestrator/src/modules/run-stream/run-stream.ts`'s `streamPlanRun`: classification runs only when `threadActionsFor` returned anything at all for this thread. So for most messages (including "hi") no extra Laya call is spent, `generateReply` (cost 5) stays the only action in the catalog and wins trivially. The plain text reply (`albedo`/`beta-text`) is exactly the "default, cheap path" that wins when the classification gives no reason to make the `goal` harder.

Why not a `GoapAction` inside the graph: `plan()` matches an action to a goal by its **static** `effects` (see `plan.ts`). One action cannot promise `{ messageIntent: "chat" }` for one call and `{ messageIntent: "addToCart" }` for another. So branching on the classification result cannot be expressed as a node of the backward-chaining graph. It is the same argument as in "Rejected option" above, one level up: not a step inside the shopping trip, but the choice of the whole trip at the start of a turn.

## Tool arguments: bounded vs open

Unchanged since the first version. `buildArguments` takes a parameter's value from `WorldState` by matching name, which covers parameters whose value is already known (say, a `budget` extracted earlier by a separate action). For parameters with an `enum` in the JSON Schema that are not in `WorldState` yet, Laya can be asked a separate `score`/`choice` sub-question with options straight from the `enum` in `execute()`. That is bounded too and works the same on any site, because the enum comes from `inputSchema`, it is not hardcoded.

Free-text parameters with no `enum` and no match in `WorldState` (for example "write a search query") are where plain Laya does not work by construction. That is a deliberate escalation point to albedo/Jev (a separate `createTextAction` that fills the needed `WorldState` fact before the tool action gets to it), not something to imitate with Laya.

## Limitations

- **Preconditions are a heuristic, not a guarantee.** Unlike `effects` (what a tool most likely produces, fairly reliably read from its description), the right call *order* is harder to guess: `PRECONDITIONS_BY_INTENT` is a generic per-category default, not a fact about a particular site. If the plan picks the wrong order nothing crashes: the real tool call just returns an error or the wrong effect, and `runPlan`'s replanning already handles that (see `executor.ts`), at the cost of one extra tool call.
- **Fixed taxonomy** (`TOOL_INTENTS`): generic for e-commerce, not universal. A tool that fits no category falls into `"other"` with empty effects (useless to the planner; reachable only as a goal itself through `toolResult:<name>`). Extending the list for a new domain is a deliberate decision, not automation.
- **MCP tool annotations** (`readOnlyHint`/`destructiveHint`/`idempotentHint`/`openWorldHint`, a standard part of the MCP tool descriptor) are not mixed in yet, but should be: they give Laya an extra signal with nothing site-specific (for example `destructiveHint` correlates with `checkout`/`removeFromCart`) and need no new infrastructure, only adding them to the `state` that `decide()` sees.

## Scenario "buy 1 cheese": choose a store, find the product, add it to the cart

Implemented 2026-10-01. What was broken (the `plan_runs` trace of a real run): the `{inCart:true}` goal was built, but there was no chain. (1) `choose_store` was classified as `select`; the taxonomy had no "store" step. (2) Nobody pulled "cheese" and the quantity out of the message, while `add_to_cart` needs an `items:[{product, quantity}]` array that `buildArguments` could not build. (3) The server threw away the `search_products` answer (product names). (4) A failed run left `webmcp:…:result = "error"` in the checkpoint, and every following message "failed" at once with 11 useless replans.

The plan for `addToCart` now looks like this (every step is visible in the trace):

```
parseProductRequest (beta-text, JSON)  →  query="cheese", quantity=1
choose:choose_store.store (Laya choice) →  store="Penny Pantry"     ← options and their descriptions from the tool schema's enum
choose_store      (browser, WAITING)    →  storeOpen
search_products   (browser, WAITING)    →  catalogSearched, product="<first product in stock>"
add_to_cart       (browser, WAITING)    →  inCart   (items:[{product, quantity}])
generateReply     (beta-text)           →  reply to the user: what exactly went into the cart
```

- **Taxonomy** (`intent-taxonomy.ts`): a new intent `chooseStore` → `{storeOpen}`; `search` needs `storeOpen`+`requestParsed`; `addToCart` needs `storeOpen`+`catalogSearched`+`requestParsed`. Laya's criteria are a dictionary with descriptions (`INTENT_DESCRIPTIONS`), not bare labels: "go to the Greenleaf market" used to come back as `checkout`.
- **No such step on the site** is no problem: `pruneUnproducibleFacts` drops preconditions no catalog action can satisfy (a site with one store just skips "choose a store").
- **A required enum parameter** (`required` + `enum` in the tool schema) gets its own step with a Laya `choice` (`choose:<tool>.<param>`, cost 1); the value descriptions come from the parameter's `description` ("Greenleaf Market: …. Penny Pantry: …"). A store already open in the conversation is not chosen again.
- **Arguments** are written by `delta-function-call` (`FunctionCallAgent`, Qwen3-1.7B on `llama-server`): Laya picks *which* tool to call, delta fills *only the JSON of its parameters*. One call per tool with parameters. The prompt is the rules + the tool schema + the run's facts (`query`, `quantity`, `store`, without the internal `webmcp:*`/`page:*`) + the last answer of another tool (≤1500 characters) + the user's message. Qwen3 thinking is off (`chat_template_kwargs.enable_thinking=false`: with it, ~200 tokens and 10 s per object, measured 2026-10-02). A request not in English does not go into the prompt; it is replaced by "(not in English: use the known facts)", because the model copies Russian words into the arguments ("сыр" instead of "cheese"), while the English facts (`query`, `quantity`) come from `parseProductRequest`. Decoding is constrained by `inputSchema` (`response_format: json_schema`), `temperature 0`.
  Then `groundArguments` removes optional fields that are not in the request's words (a "department" filter, an invented price limit). It works on English words; for a Russian request the optional enum fields are dropped (the safe side); numbers and required fields are not touched. The model is not called for a tool without parameters.
  **Errors**: first the "formatter" (`repairArguments`) strips code fences, `<think>`, chatter around the object and trailing commas, closes cut-off `]`/`}`, and coerces values to the schema's types (`"3"`→3, `"vegan"`→`["vegan"]`, `"dairy"`→`"Dairy"`); `null` on an optional field means "not set". A string cut mid-word is not completed: no invented values. Then `validateArguments` (`required`, `type`, `enum`, `items`). Whatever the formatter could not fix goes back to the model: its answer and the list of problems ("query is required") are added to the dialogue and it fixes them itself, up to two corrections (at temperature 0 the same request would give the same answer); every attempt is a row in `llm_calls`. Network/HTTP errors are not retried. After a failure (no `FUNCTION_CALL_BASE_URL`, attempts exhausted, delta unreachable) the fallback is `buildArguments` (an array of one object from the facts, with field names `product`, `quantity`), and the failure itself goes to the orchestrator's `onError` (log + Sentry). If the final arguments still fail the tool's schema (a required field missing), the call is not sent to the browser: the step counts as failed (`toolResult:<tool> = false`) and the planner rebuilds the plan. The call is written to `llm_calls` as a `decision` with provider `delta`.
- **Data between steps**: the tool's answer text is kept as `webmcp:<tool>:text`. From a search answer the first list item not marked "OUT OF STOCK" is taken; a "No products found" answer fails the step; an unrecognised format substitutes the search query itself and the site resolves the name.
- **Query and quantity**: a separate `Agent` (`productRequestAgent`, the same `beta-text` with its own system prompt, ≤48 tokens, the query always in English). A garbage model answer falls back to the user's words as the query and the first number as the quantity.
- **Reply last**: `generateReply`'s preconditions are the task goal's facts (`replyAfterTask`), and it is given the outcome ("added 1 × …"), not the original request.
- **Checkpoint**: saved in full only when the run waits for a browser tool (`WAITING`). Any other ending keeps only the conversation facts (`SESSION_FACTS`: `storeOpen`, `store`); a new message starts from them and ignores the rest.
- **Loop guard**: `RunPlanOptions.maxActionFailures` (the orchestrator sets 2): an action that twice fails to deliver its promised effects stops the run instead of 10 replans.

Found along the way: Elysia silently drops everything not in the schema from the `/v1/widget/tools` body. `required` in `inputSchema` was lost, and required parameters were invisible to the planner (now it is in the schema).

Limitations: parsing the search answer is a heuristic for "- Name — price" lists; "the first one" picks the first product in stock without comparing prices; switching stores mid-conversation is not supported yet (an open store is not asked again); when the search fails the user gets an `error` line, not a human answer.

## The visitor's current page

Added 2026-10-01. The widget sends `page` (`pathname + search`) with every message and every tool result; the server puts `page:path`/`page:lang` into `WorldState` (contract: [Admin API](/docs/drafts/admin-api/)). Why: without it the planner does not know where the visitor is and may send the browser where it already is (an extra navigation, an extra tool call).

- **Language and query are part of the address, but not part of "the same page"**: `parsePage` (`goap/page.ts`) strips a `/ru/`, `/en-US/` prefix and the `lang`/`locale`/`language`/`hl` parameters (the language goes into `page:lang`), drops `utm_*`/`gclid`/`fbclid`/`yclid`/`ref`; the remaining parameters are compared as a set (order does not matter, repeated values are kept). The language prefix is a heuristic (two letters + a segment boundary); it can only be wrong the same way on both sides of the comparison.
- **`samePage(current, target)`**: the path matches (without the language) and every destination parameter is on the current page. A destination without parameters matches any query on the same path.
- **The `navigate` intent** (`pageOpened`): a navigation tool action with a `url`/`path`/`page`/`href`/`route`/`to`/`target` parameter is not sent to the browser when `samePage` is true; the effect is applied at once. Where the destination address comes from is up to the site and the next steps (today, a fact named like the parameter).
- **After a tool** the page is updated: `prepareResume` replaces `page:*` with what the widget sent with the result (the demo's `search_products` tool navigates to `/store/<id>?q=…` by itself).
- Privacy: `#hash` is not sent, nor is the origin; the query goes as is. If a site ever puts secrets into the query, they must be removed before the widget (there is no filter attribute yet).

## Progress for the user

Added 2026-10-01. While the plan runs the user sees a text flow above the reply instead of an empty "typing…":

```
✓ Понял: 1 × «cheese»
✓ Выбран магазин: Penny Pantry
✓ Магазин открыт: Penny Pantry
✓ Нашёл: Mozzarella Cheese
… Добавляю в корзину: 1 × Mozzarella Cheese
```

- **Where the text comes from**: `GoapAction` got an optional `describe(state, phase)` → `running` (the state before) / `done` and `failed` (the state after, so "Found: …" knows what was found). Texts are written per tool *intent* (`webmcp-steps.ts`), not per name: any site's "search" says "Searching for «…»…". Bilingual (`step-text.ts`: ru/en by `page:lang`). No `describe` means the step is silent (`generateReply` does not need one: it streams `delta`).
- **Executor**: `RunPlanOptions.onStep` gets `{action, phase, text}`: `running` before the start, then `done`, or `failed` if the promised effects were not delivered or the action threw. Waiting for a browser tool is only `running`; `done` arrives in the resumed run.
- **Transport**: an NDJSON `step` line (contract: [Admin API](/docs/drafts/admin-api/)), identified by `id` = the action's name; a repeat replaces it. This is a UX channel; the `plan_events` trace (for the admin panel) stays separate.
- **Widget**: `ChatMessage.steps`; the lines are drawn above the text (`…`/`✓`/`✕`, an error in colour), always as text. A reply that is only the flow (the task failed) is not removed. Not saved to history: after a page reload only the reply text remains.
- Example failure messages: «Ничего не нашёл по запросу «cheese»» (nothing found for "cheese"), «Не удалось добавить в корзину: …» (could not add to the cart: …), «Вы уже на этой странице» (you are already on this page; a skipped navigation).
