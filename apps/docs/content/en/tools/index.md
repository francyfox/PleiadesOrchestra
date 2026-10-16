---
title: Tools
---

# Exposing tools from your site

The orchestrator knows nothing about your site except the tools you give it. A **tool** is a function that runs in the visitor's browser: search the catalog, add a room to a booking, set a pizza size, open an order. You register tools with [WebMCP](https://github.com/webmachinelearning/webmcp) (`document.modelContext`); the widget reads them and the orchestrator plans around them.

## Registering a tool

```js
await document.modelContext.registerTool({
  name: "search_products",
  description: "Search the shop catalog by free-text query.",
  inputSchema: {
    type: "object",
    properties: {
      query: { type: "string", description: "What to look for" },
      maxPrice: { type: "number", description: "Upper price limit" },
    },
    required: ["query"],
  },
  async execute({ query, maxPrice }) {
    const items = await shop.search(query, { maxPrice });
    return {
      content: [{ type: "text", text: items.map((i) => `- ${i.name} - $${i.price}`).join("\n") }],
    };
  },
});
```

| Field | Required | Notes |
| --- | --- | --- |
| `name` | yes | Matches `^[a-zA-Z0-9_.-]{1,128}$`. Unique on the page; registering a name twice throws. |
| `description` | yes | Non-empty string. |
| `inputSchema` | no | JSON Schema with `type: "object"`, `properties` and optionally `required`. Must be JSON-serializable. |
| `execute(args, options)` | yes, to be callable | Receives the arguments object. Returns the result (see below). |
| `annotations` | no | Stored by the polyfill. See [Annotations](#Annotations). |

`registerTool` also takes `{ signal }` as a second argument; aborting the signal unregisters the tool. Register and unregister freely: the page's catalog is allowed to change with its state (a cart tool only while a cart exists, a checkout tool only on the checkout step).

### Results

Return an MCP-style object, a plain string, or any JSON value:

```js
return { content: [{ type: "text", text: "Added 2 x Margherita to the order." }] };
return { content: [{ type: "text", text: "Size 'huge' does not exist. Try: small, medium, large." }], isError: true };
```

The orchestrator keeps the text of the answer (the `content[].text` parts, a string, or JSON as a last resort; cut at 4000 characters) and reads it in later steps, for example to pick the first product of a search. With `isError: true` the step counts as failed. Write error text as advice: if it names another of your tools ("No store is open. Call `choose_store` first"), the planner runs that tool and retries.

## How the orchestrator reads a tool

The orchestrator understands a tool from its **name and its schema**, not from site-specific code.

1. When the panel opens, the widget calls `getTools()` and sends the catalog once for the thread (it re-sends it, debounced by 300 ms, when the page fires `toolchange` and the catalog really changed). It sends `name`, `description` and `inputSchema` (`type`, `properties`, `required`).
2. The orchestrator classifies each tool. The **name** decides first: the words of `add_to_cart`, `addToCart` and `add-to-cart` are the same. A tool named like `search_*`, `find_*`, `checkout`, `remove_*`, `get_*` is recognized by its verb. If the name decides nothing, the small decision model chooses from the name and description. See [Intents](/docs/intents/) for what the categories are today.
3. For a message, the planner picks the tools and their order. A separate small model fills in each call's arguments from your schema (enum values, `required`, descriptions).

Practical consequences:

- Use clear `verb_object` names. Extra qualifiers in a name (`add_recipe_to_cart` next to `add_to_cart`) mark a *specialist*: it is used when the visitor names one of its enum values, and the plain tool wins otherwise.
- Put the choices a visitor might say in the schema as `enum`. Describe each parameter in `description`.
- A name containing `remove`, `delete`, `clear`, `empty` or `cancel` is treated as a removal; `checkout`, `pay`, `purchase` or `place` + `order` as a checkout. Those two are never chosen by the model, so name such tools honestly.
- Read-only tools (`get_`, `list_`, `view_`, `check_`, `status`, `history`) tell the planner what the site holds now, which matters for requests about "everything".

### Catalog limits

The catalog is `POST /v1/widget/tools` ([Widget API](/docs/api/widget/#POST--v1-widget-tools)). The serialized `webmcpTools` array may be at most 20,000 characters by default (`WIDGET_MAX_WEBMCP_TOOLS_CHARS`); more gets `413`. Keep descriptions short.

## Examples from different domains

### Online shop

```js
document.modelContext.registerTool({
  name: "add_to_cart",
  description: "Add a product to the cart.",
  inputSchema: {
    type: "object",
    properties: {
      productId: { type: "string" },
      quantity: { type: "number", description: "Defaults to 1" },
    },
    required: ["productId"],
  },
  async execute({ productId, quantity = 1 }) {
    await cart.add(productId, quantity);
    return { content: [{ type: "text", text: `Added ${quantity} x ${productId}.` }] };
  },
});
```

Works for a grocery store, an electronics shop or a clothing store alike; only the names and descriptions differ.

### Hotel booking

```js
document.modelContext.registerTool({
  name: "search_rooms",
  description: "Find available rooms for a stay.",
  inputSchema: {
    type: "object",
    properties: {
      checkIn: { type: "string", description: "Date, YYYY-MM-DD" },
      checkOut: { type: "string", description: "Date, YYYY-MM-DD" },
      guests: { type: "number" },
      roomType: { type: "string", enum: ["single", "double", "suite"] },
    },
    required: ["checkIn", "checkOut", "guests"],
  },
  async execute(args) {
    const rooms = await hotel.availability(args);
    if (rooms.length === 0) {
      return { isError: true, content: [{ type: "text", text: "No rooms free on those dates. Try other dates." }] };
    }
    return { content: [{ type: "text", text: rooms.map((r) => `- ${r.id}: ${r.type}, $${r.rate}/night`).join("\n") }] };
  },
});

document.modelContext.registerTool({
  name: "book_room",
  description: "Reserve a room found by search_rooms.",
  inputSchema: {
    type: "object",
    properties: { roomId: { type: "string" }, guestName: { type: "string" } },
    required: ["roomId", "guestName"],
  },
  async execute(args) { /* ... */ },
});
```

### Pizza builder

```js
document.modelContext.registerTool({
  name: "set_pizza_size",
  description: "Set the size of the pizza being built.",
  inputSchema: {
    type: "object",
    properties: { size: { type: "string", enum: ["small", "medium", "large"] } },
    required: ["size"],
  },
  async execute({ size }) {
    builder.setSize(size);
    return { content: [{ type: "text", text: `Size is now ${size}.` }] };
  },
});

document.modelContext.registerTool({
  name: "add_topping",
  description: "Add a topping to the pizza.",
  inputSchema: {
    type: "object",
    properties: { topping: { type: "string", enum: ["mushrooms", "olives", "pepperoni", "basil"] } },
    required: ["topping"],
  },
  async execute({ topping }) { builder.addTopping(topping); return "ok"; },
});
```

<!-- TODO: today the planner's built-in categories describe an online shop (see Intents). A tool like set_pizza_size has no matching category and is classified "other"; whether such a tool can be the goal of a plan on a channel without an intent pack is planned work (PO-41), not verified current behaviour. -->

### Declarative form

A form can be a tool without JavaScript. The polyfill reads `toolname`, `tooldescription` and `toolparamdescription` and builds the schema from the form fields (`required` fields become `required`; a `<select>` becomes an `enum`):

```html
<form toolname="request_callback" tooldescription="Ask the clinic to call the visitor back." toolautosubmit>
  <input name="phone" required toolparamdescription="Phone number to call" />
  <select name="topic" toolparamdescription="What the call is about">
    <option>appointment</option>
    <option>results</option>
  </select>
  <button type="submit">Send</button>
</form>
```

Without `toolautosubmit` the polyfill fills the fields and waits for the visitor to submit.

## Tool errors

A tool can fail in two ways.

- **Report it as a result.** Return `{ isError: true, content: [{ type: "text", text: "..." }] }`. The run continues: the step fails, and the text is kept as the site's answer. If the run cannot reach its goal, the stream ends with `error` / `task_failed` and the last answer of the site as `hint` (at most 400 characters), which the widget shows to the visitor.
- **Throw.** In the polyfill, a thrown error that carries a numeric `status` (100-599) and an optional `retryAfter` (seconds, number or numeric string) keeps both when the call crosses windows (`WEBMCP_EXECUTE_TOOL_RESPONSE`); the requesting window re-validates them and rethrows an error with the same fields. Use it to signal rate limiting:

```js
async execute(args) {
  const res = await fetch("/api/search?q=" + encodeURIComponent(args.query));
  if (res.status === 429) {
    throw Object.assign(new Error("Search is rate limited"), {
      status: 429,
      retryAfter: Number(res.headers.get("retry-after") ?? 30),
    });
  }
  // ...
}
```

<!-- TODO: `status`/`retryAfter` are carried by the polyfill's cross-window bridge only. In chat.ts the widget's own tool call (`webmcp.callTool`) is not wrapped in try/catch, and nothing in the orchestrator reads `status` or `retryAfter`; a tool that throws on the same page appears to end the turn as a generic failure. Confirm intended behaviour before documenting it as a guarantee. Prefer returning `isError: true` for errors the planner should react to. -->

## Annotations

`annotations` (for example `{ readOnlyHint: true }` from the WebMCP proposal) is accepted by `registerTool`, stored by the polyfill and passed to other windows that list your tools. The widget does not forward annotations to the orchestrator: it sends only `name`, `description` and `inputSchema`, and the server's request schema drops other fields. Today annotations have no effect on planning.

## Tools in other windows

By default the polyfill exposes your tools to no other window. To let an embedding page, an opener or an iframe list and run this page's tools through `postMessage`, list their origins on the widget:

```html
<pleiades-chat agent-url="..." publishable-key="pk_..." expose-tools-to="https://shop.example,https://pay.example"></pleiades-chat>
```

Replies are always addressed to the asker's origin, never `*`. Only the page that hosts the tools needs this. A page that consumes tools from an `<iframe allow="tools" src="...">` does not.

## The polyfill

`@repo/webmcp-polyfill` (Apache-2.0, adapted from Google's `webmcp-tools` polyfill) is bundled into the widget; the widget installs it on load. It defines `document.modelContext` only where it is missing, so native WebMCP is used where a browser has it. It provides `registerTool`, `getTools`, `executeTool`, the `toolchange`, `toolactivated` and `toolcancel` events, declarative form tools and the cross-window bridge. You do not install it separately.

<!-- TODO: the polyfill package is private (not published); the docs should not tell sites to install it. Confirm whether a standalone publish is planned. -->
