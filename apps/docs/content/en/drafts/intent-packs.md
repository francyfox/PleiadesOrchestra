---
title: Intent packs
---

# Intent packs

Design notes for GitHub issue PO-41 (2026-10-19). **Proposed, not implemented.** The public behaviour today is described in [Intents](/docs/intents/).

## The problem

The intent taxonomy is hardcoded in `packages/core/src/goap/intent-taxonomy.ts` and describes an online shop. On other sites it breaks action choice: in the playground "make the pizza bigger" was read as `addToCart` (0.63) and planned as `add_topping` with the step "Adding to cart", while `set_pizza_size` (intent `other`, no effects) could not become a goal. Only a developer can change the taxonomy, although every site needs its own.

## What the classifier uses today

Matching runs in layers, and only one of them is per channel:

| Layer | Where | How | Weights | Scope |
|---|---|---|---|---|
| Word rules | `message-cues.ts` | an ordered list of stem regexes, first match wins | none, the order decides | global, in code |
| Verbs in a tool name | `tool-cues.ts` | name tokens (`get_cart` → get, cart) against verb lists | none | global, in code |
| Site memory | `intent-memory.ts` + `intent_examples` | exact text match, then naive Bayes over words, silent below 0.85 | yes | per channel |
| Laya | `message-intent.ts` | one `choice` over the intent descriptions | calibrated `confidence` | intent list is global |

- Nothing stores sentence templates for matching. `intent_examples` keeps whole normalised English messages that Laya labelled and an admin approved: the training set of the Bayes model and the unit an admin reviews. Duplicates collapse by `textKey` (`seenCount++`). The table grows without bound; trimming old `pending` rows is a later task.
- The only templates are the step texts in `webmcp-steps.ts` ("Searching for «…»…"): what the user sees, not what is matched.
- No embeddings are used anywhere yet.

## What an intent adds over WebMCP

For one tool an intent adds nothing: every tool action already has its own `toolResult:<name>` effect (`webmcp-actions.ts`), and the intent only adds shared facts from `EFFECTS_BY_INTENT`. What it does add:

1. **Order.** A WebMCP descriptor has a name, a description and an `inputSchema`, but no "call that first". The intent gives the planner the chain: `addToCart` needs `catalogSearched`, which `search` gives. This is the one part nothing else replaces today.
2. **Substitutes.** `add_to_cart` and `add_recipe_to_cart` both give `inCart`, so when one fails `tool-error-recovery.ts` finds the other. A bare `toolResult:<name>` has no substitute.
3. **Guard.** `checkout`/`removeFromCart` run only on the user's explicit words: a safety policy, not a tool description.
4. **A bounded choice for Laya.** Laya has a 192-token budget for its options; ten intents fit one question, forty site tools do not.

Where WebMCP itself can carry this instead:

- The guard can come from MCP tool `annotations` (`readOnlyHint`/`destructiveHint`). Not checked yet: which annotations our polyfill keeps and which survive `POST /v1/widget/tools` (Elysia drops fields missing from the schema).
- Order can partly be read from `inputSchema` (a tool needs `productId`, so something must return it), but WebMCP tools rarely have an output schema, so this stays a heuristic.
- The bounded choice can be replaced by embeddings: the nearest tool, with no limit on the number of options.

So an intent pays off only for sites with **multi-step flows with hidden dependencies** and **dangerous actions without annotations**: the typical shop. For "change the pizza size" it only gets in the way.

## Decisions

- **Default for every channel: the tool is the goal.** A message picks the site's tool directly (`toolResult:<tool>`); the danger comes from annotations, and without them from the verbs of the name (`tool-cues.ts` already does this for remove/pay).
- **An intent pack is an optional layer** of dependencies and substitutes for complex sites. Today one pack needs it: the built-in "Online shop", which is the current taxonomy. Existing channels are migrated to it so their behaviour does not change.
- **The Laya question stays in code**, one general sentence for every channel: replace "in an online shop" in `MESSAGE_INTENT_INSTRUCTIONS` with "on this site" and rerun `bun run eval:intents`. It is not a pack field: the options' descriptions already carry the domain, the sentence counts against Laya's budget (`choice-rounds.test.ts`), and the eval is calibrated on one wording.
- **No step texts in a pack.** The generic `Running: {title}…` fits any site. Basketful would then show generic steps instead of "Searching for «cheese»…".
- **No `message-cues` in a pack.** A channel with a pack runs in `rules: "guarded"` mode: only the checkout/removal words stay as rules.
- **Not a store, not plugins.** A pack is data, not code; sharing it needs import/export, not a marketplace. A store becomes a catalogue of these files later, when two or three real packs exist besides the shop.

## The flat action format

Classic GOAP (Orkin, F.E.A.R.) is flat on purpose: the world is a flat set of symbols, an action is a flat record of preconditions, effects and cost, and designers assign **action sets per character type** as data, which is exactly a pack per channel. Hierarchy belongs to HTN, not GOAP. So the pack is the intermediate format for the planner: `(site tools + pack) → GoapAction[]`, one flat row per tool.

The depth (an intent wraps a tool) goes away if a pack's intent and a future SDK annotation on a tool share **one row shape**: the compiler takes the tool's own annotation, else the intent's row.

A draft of the meta-schema in TypeBox (already in the catalog; `packages/core` would add it as `"catalog:"`):

```ts
import { Type as T, type Static } from "@sinclair/typebox";

const Fact = T.String({ pattern: "^[a-z][A-Za-z0-9]*$" });

/** One planner row. A tool can declare the same shape later through the SDK. */
export const ActionTemplate = T.Object({
	id: Fact,
	describe: T.String({ maxLength: 80 }), // for Laya; the shared budget is checked separately
	requires: T.Optional(T.Array(Fact)), // fact must be true
	gives: T.Optional(T.Array(Fact)), // sets true
	removes: T.Optional(T.Array(Fact)), // sets false
	confirmWords: T.Optional(T.Array(T.String())), // non-empty = only on explicit words
});

export const IntentSet = T.Object({
	schemaVersion: T.Literal(1),
	id: Fact,
	name: T.String(),
	sessionFacts: T.Optional(T.Array(Fact)),
	intent: T.Array(ActionTemplate, { minItems: 1 }),
});
export type IntentSet = Static<typeof IntentSet>;
```

A pack is authored as TOML (comments, readable; `Bun.TOML.parse` is built in) and stored and sent as JSON of the same shape. TOML is not faster than `JSON.parse`, and speed does not matter here: a pack is read once on save or load. Deep nested tables look bad in TOML, which pushes the format to stay flat.

```toml
schemaVersion = 1
id = "shop"
name = "Online shop"
sessionFacts = ["storeOpen"]

[[intent]]
id = "search"
describe = "look for products or ask what is available"
requires = ["storeOpen", "requestParsed"]
gives = ["catalogSearched"]

[[intent]]
id = "removeFromCart"
describe = "take a product out of the cart"
requires = ["storeOpen"]
removes = ["inCart"]
confirmWords = ["remove", "delete", "clear"]
```

Left out on purpose: string and number facts (`store`, `lastProduct` appear during execution), `cost` (the default is enough), the Laya question and step texts (see Decisions), links from intent to tool (the compiler's job and PO-14's review).

TypeBox does not check these, so import needs code for them: the total Laya budget of all `describe` lines (192 tokens), that every fact in `requires` is given by some `gives` (otherwise the goal is unreachable), unique ids.

Open: `confirmWords` are English, while today's checkout/removal rules in `message-cues.ts` are Russian stems. Replacing the rules with `confirmWords` means Russian messages are confirmed only through translation; measure before that.

## How Embabel does it

Embabel (`embabel-agent`) has no intermediate taxonomy; conditions come from types:

- An `@Action` is a method: its parameter types are preconditions (that type is on the blackboard), its return type is the effect. The world is flat: conditions plus `hasRun` markers.
- Conditions a type cannot express are named `@Condition` methods, declared in an action's `pre`/`post`; the docs warn that otherwise the planner assumes the condition is never set. That is the same flat `requires`/`gives` row.
- MCP tools are not planned: they are attached as `toolGroups` and the LLM calls them inside one action. The planner sees only the developer's actions. Goals are exported as MCP tools (`@Export(remote = true)`).
- `Autonomy` ranks goals against the user's request with an LLM and throws `NoGoalFound` below a confidence threshold; "open mode" assembles an agent from all actions. That is our no-pack mode.

The difference: in Embabel the developer writes the actions, so types always exist. We receive foreign tools with only a name, a description and an `inputSchema`; the intent taxonomy stands in for the missing types. The Embabel-style answer for us is an **SDK for MCP/WebMCP tools** in which a tool declares `requires`/`gives` itself, or they are derived from schemas by convention (`productId` in the input is a precondition, `productId` in an `outputSchema` is an effect). JSON Schema field names are weak types (`id`, `query`, `value` mean different things in different tools), so derivation only works for tools written with the SDK. The SDK is a new package and needs its own issue; PO-41 only fixes the row shape so the SDK can reuse it. Related: the `registerActionPack` idea in [the audit](/docs/drafts/audit-2026-10/#Service-modularity).

Embabel ranks goals with a big LLM. Laya is 1B with a 192-token budget, so ranking all goals at once does not carry over: the choice must be narrowed first, by rounds or by embeddings.

## Embeddings for the no-pack mode

The strongest candidate for picking a tool without a pack: embed each tool's name and description, embed the message, take the nearest tool by cosine. Works on any site and in any language without regexes, and fixes the Bayes model's main weakness (an unknown word means nothing to it). Caveats:

- It needs an embedding model. `llama-server --embedding` can reuse the existing image, but it is a new service, so it is proposed first, and it must be measured on CPU.
- Without an eval there is no claim it beats a Laya `choice`. Measure first on a set outside groceries (pizza, bookings and so on).

The storage side (sqlite-vec, measured) is already worked out in [the audit](/docs/drafts/audit-2026-10/#7.5-Caching-steps-and-a-vector-database).

## Testing WebMCP without a browser

The orchestrator never sees the browser: it gets only descriptors (`POST /v1/widget/tools`) and tool results. So testing splits in two:

| What | Browser needed | What exists |
|---|---|---|
| Tool choice, plan, intents, Laya | no: a fixture of descriptors in | `packages/core/eval/demo-tools.ts`, `plan-bench.ts`, `intents.ts` |
| How the polyfill reads tools from a page and runs them | a DOM, not necessarily a browser | hand-written `document` fakes in `install.test.ts`, Playwright in `apps/e2e` |

The gap is the second layer: the polyfill's fake `querySelectorAll("form[toolname]")` always returns `[]`, so parsing declarative forms into schemas (`declarative-forms.ts`) is never tested without a browser. Closing it does not need Chromium: `happy-dom` as a devDependency of the polyfill (Bun's recommended DOM for `bun test`) and tests "HTML page → descriptors" on two or three different domains. A new dependency, so it needs a yes first.

- **Declarative WebMCP is HTML, not JS**: `<form toolname tooldescription>` with fields carrying `name`/`type`/`required` and `toolparamdescription`. Parsing it needs a DOM, or even the streaming `HTMLRewriter` built into Bun, which reads forms and attributes out of raw HTML with no DOM and no dependency. No AST.
- **Imperative WebMCP does not guarantee all tools at once** either: `registerTool` is runtime code, and SPAs often register tools on route changes. Parsing it from an AST is unreliable (dynamic names and schemas). Only declarative forms in server-rendered HTML can be read statically; forms rendered by client JS need a browser in either style.

## Tools of other pages

Declarative tools exist only on the page that has the form: that is WebMCP's design, and the polyfill already reports changes (`observer.ts`, `observeDeclarativeTools`). The problem is the planner: on `/catalog` a plan cannot include a `checkout` that exists only on `/cart`.

This fits the flat format: if the server accumulates a channel's catalog across all the pages it saw tools on (the idea of PO-14), a tool gets `requires = ["onPage:/cart"]` and `navigate` gives `onPage:*`. The planner inserts the navigation itself, and the existing replanning runs when a real effect differs from the expected one. The hard part is generalising URLs to patterns (`/product/123` → `/product/:id`): a heuristic to be measured. A separate task with PO-14, not part of PO-41.

Not checked: whether the widget sends descriptors again on a page change (the call is in `packages/pleiades-widget/src/lib/api/api.ts`), and what the server keeps of them. That decides whether a cross-page catalog already accumulates or has to be built from scratch.

## Scope of PO-41

1. **No-pack mode** as the default: `toolResult:<tool>` goals, guard from annotations or name verbs, e2e on the pizza demo.
2. **The taxonomy as a value** instead of module constants (about 30 places in `packages/core` read them directly), the pack bound to a channel, migration of existing channels to "Online shop", the pack screen in the admin panel, TOML import/export with the checks above.
3. The general Laya question and a rerun of `eval:intents`.

Out of scope, separate issues: a store of packs, the MCP/WebMCP SDK, embeddings for tool choice, `happy-dom` tests for the polyfill, tools of other pages (with PO-14).

Risk: the no-pack mode cannot build chains, so a compound request ("find and buy") on a site without a pack runs as one call. Check it in e2e before making it the default.
