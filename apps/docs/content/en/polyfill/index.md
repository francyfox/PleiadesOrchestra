---
title: Polyfill
---

# The WebMCP polyfill

Browsers do not all have WebMCP (`document.modelContext`) yet. The widget ships a polyfill so the [tools](/docs/tools/) of your site work in any browser.

## What it does

`@repo/webmcp-polyfill` (Apache-2.0, adapted from Google's `webmcp-tools` polyfill) is bundled into the widget; the widget installs it on load. It defines `document.modelContext` only where it is missing, so native WebMCP is used where a browser has it. It provides `registerTool`, `getTools`, `executeTool`, the `toolchange`, `toolactivated` and `toolcancel` events, declarative form tools and the cross-window bridge. The widget installs it on load, so a page with the widget needs nothing else.

## Use it without the widget

To use it without the widget, import it from the widget package. Importing registers nothing; call the function yourself:

```js
import { installWebMcpPolyfill } from "@shalotts/pleiades-widget/webmcp-polyfill";

installWebMcpPolyfill({ exposeToolsTo: ["https://embedder.example"] });
```

Options are the same as the widget's `expose-tools-to` attribute (see [Tools in other windows](/docs/tools/#Tools-in-other-windows)). Calling it twice is safe: it never replaces an existing `document.modelContext`, but it refreshes the `exposeToolsTo` list.
