---
title: Widget
---

# The `<pleiades-chat>` widget

A single framework-agnostic web component. It shows a launcher button in a corner of the page and opens a side panel with the chat. It lives in a shadow root, so the host page's CSS cannot break it. It works the same in plain HTML, React, Vue, Svelte or Angular.

## Install

<WidgetInstall />

`agent-url` and `publishable-key` come from your channel in the admin panel. The widget also installs a WebMCP polyfill on pages without native support, so your [tools](/docs/tools/) work in any browser.

If the configuration is wrong the element renders nothing and logs one `[pleiades-widget] <code>` line to the console. See [Errors](#Errors).

## Attributes

All configuration is through attributes. Changing one re-mounts the widget.

| Attribute | Default | Description |
| --- | --- | --- |
| `agent-url` | required | Base URL of the orchestrator. `https` only; plain `http` is accepted for `localhost`, `127.0.0.1` and `[::1]`. No username or password in the URL. |
| `publishable-key` | required | The channel's public key. Must match `pk_` followed by at least 8 characters from `A-Za-z0-9_-`. |
| `position` | `bottom-left` | Launcher corner: `bottom-left`, `bottom-right`, `top-left`, `top-right`. The panel slides in from the same side. Unknown values fall back to `bottom-left`. |
| `heading` | localized | Panel title. |
| `greeting` | localized | First bubble. |
| `placeholder` | localized | Hint in the message box. |
| `lang` | `<html lang>`, else browser language | `en`, `ru` or `kk`. Only the first two letters are read (`ru-RU` works); anything else is English. |
| `customer-context` | none | Flat JSON object of facts the site already knows, e.g. `'{"city":"Almaty","tier":"gold"}'`. Values must be strings, numbers or booleans; other fields are dropped with a console error. Sent with every message. |
| `hotkey` | `mod+j` | Opens and closes the panel. `mod` is Ctrl, or Cmd on a Mac. Other examples: `ctrl+shift+k`, `alt+/`. An empty value turns it off. |
| `mic-hotkey` | `mod+shift+space` | Starts and stops dictation while the panel is open. Same format. Empty turns it off. |
| `expose-tools-to` | none | Comma-separated origins (`https://a.example,https://b.example`) whose windows may list and run this page's tools through `postMessage`. `*` and invalid origins are ignored. See [Tools](/docs/tools/#Tools-in-other-windows). |
| `examples` | built-in three | Up to three suggestions shown until the first message: a JSON array of strings, `'["Find a jacket","Where is my order?"]'`. `'[]'` hides them. An unparsable value keeps the built-in ones. |
| `open` | absent | Boolean attribute. The panel starts open. Also the `open` property. |
| `test-api` | absent | Boolean attribute. Also exposes `window.pleiadesChat.send(text)` for browser automation. Off by default: no global on production pages. |

Dictation uses the browser's Web Speech API where it exists. The microphone button is dimmed where it does not.

## Element methods and properties

```js
const chat = document.querySelector("pleiades-chat");
```

| Member | Description |
| --- | --- |
| `chat.open` | Property reflecting the `open` attribute. Set it to open or close the panel. |
| `chat.toggle()` | Flips `open`. |
| `chat.send(text)` | Sends `text` as if a visitor typed it and pressed Send. Opens the panel, runs the page's tool calls, and resolves when the turn ends. Never rejects. |
| `chat.resetSession()` | New conversation for the same visitor: a new thread, an empty panel, the page's tools announced again. Never rejects. |
| `chat.getVisitorToken()` | Resolves to this browser's visitor token (creating the session if needed), or `undefined` while the element is not configured. Pass it to your server for [`identify`](/docs/api/server/#Identify-a-visitor). |
| `chat.agentUrl`, `publishableKey`, `position`, `heading`, `greeting`, `placeholder`, `lang`, `customerContext`, `examples`, `hotkey`, `micHotkey`, `exposeToolsTo` | Properties mirroring the attributes (strings). Setting `null` or `undefined` removes the attribute. |

### `send()`

```js
const r = await chat.send("book a double room for two nights from Friday");
// { requestId?, reply, steps: [{ text, phase }], status: "done" | "failed" | "error", error? }
```

| Field | Meaning |
| --- | --- |
| `status: "done"` | The goal was reached. |
| `status: "failed"` | The server worked but the site could not do the task. `error` holds the site's own last answer, if any. |
| `status: "error"` | Busy, not configured, message too long, server fault, or stopped. `error` says what. |
| `reply` | Final assistant text of the turn. |
| `steps` | The progress lines shown for the turn; `phase` is `running`, `done` or `failed`. |
| `requestId` | Id of the turn's first `tool_call` (opens the run in the admin `/flow/<id>`). Absent for a turn with no browser-side tool call. |

### `resetSession()`

The orchestrator keeps per-conversation facts (which store is open, the last product found). A page that swaps one app for another should reset on every switch:

```js
picker.addEventListener("change", () => chat.resetSession());
```

Different sites should use separate channels (one `publishable-key` each); switching the key gives each its own conversation, kept across reloads.

## Theming

Set CSS variables on the element:

| Variable | Purpose |
| --- | --- |
| `--pleiades-accent`, `--pleiades-accent-fg` | Accent color and text on it. |
| `--pleiades-bg`, `--pleiades-fg` | Panel background and text. |
| `--pleiades-muted`, `--pleiades-muted-fg` | Secondary surfaces and text. |
| `--pleiades-border` | Borders. |
| `--pleiades-destructive`, `--pleiades-destructive-fg` | Error color and text on it. |
| `--pleiades-font-family` | Font. |
| `--pleiades-font-scale` | Multiplier of every text size; default `1.5`. `1` gives a compact 14 px base. |

```css
pleiades-chat {
  --pleiades-accent: #0b6e4f;
  --pleiades-accent-fg: #fff;
  --pleiades-font-family: "Inter", sans-serif;
}
```

For anything beyond tokens, use CSS Shadow Parts:

```css
pleiades-chat::part(panel) { border-radius: 0; }
pleiades-chat::part(send)  { text-transform: uppercase; }
```

Parts present in the templates: `launcher`, `panel`, `header`, `close`, `messages`, `error`, `mode`, `hint`, `tooltip`, `composer`, `input`, `send`, `mic`, `link`.

`@shalotts/pleiades-widget/style.css` is the exact stylesheet the widget injects into its shadow root. Use it as a reference for class names; linking it into a page does nothing, because shadow DOM does not apply it there.

## Types

The package ships TypeScript declarations, including the `HTMLElementTagNameMap` entry, so `document.querySelector("pleiades-chat")` is typed. For React JSX, import the augmentation once:

```ts
import type {} from "@shalotts/pleiades-widget/react";
```

## Errors

Configuration errors are logged once as `[pleiades-widget] <code>: <advice>` and nothing is rendered.

| Code | Cause |
| --- | --- |
| `missing_agent_url` | `agent-url` is empty. |
| `invalid_agent_url` | Not an http(s) URL, or it has a username or password. |
| `insecure_agent_url` | `http` to a host other than localhost. |
| `missing_key` | `publishable-key` is empty. |
| `secret_key` | The key starts with `sk_`. Treat it as leaked and rotate it. |
| `invalid_key` | Not a `pk_` key of the expected shape. |

A bad `customer-context` logs `invalid_customer_context` and is dropped; the widget still works.

Runtime failures show in the panel. They map from the [API status](/docs/api/widget/#Error-statuses): no answer is a network error and locks the composer, `403` is forbidden, `413` is "too long", `429` is rate limited, a terminal stream `error` with `code: "task_failed"` shows the site's advice and never locks the composer. An origin the channel does not allow looks like a network error in the browser: the server answers `403` without CORS headers, so the browser hides the reason.

## Security

- **Only `pk_` keys.** The widget refuses to start with an `sk_` key. A secret key belongs on your server, for [`identify`](/docs/api/server/#Identify-a-visitor).
- **https only** for `agent-url`, except localhost, so the visitor token never travels in clear text.
- **Allowed origins.** The channel lists the origins that may use it; the server checks the `Origin` header, which a browser cannot fake. A copied key is useless on another site.
- **No secret in the page.** The key is sent once, to get a visitor token. Every later request carries only the token.
- Requests use `credentials: "omit"` and `cache: "no-store"`: no cookies, nothing cached.
- The token and thread id are kept in `localStorage` under a name derived from agent URL and key, so two sites never share a session. If storage is blocked the widget falls back to memory.
- Message text is rendered with `textContent`, never as HTML.
- Do not put sensitive data in `customer-context`. Keep it to a few short facts (country, city, a tier label), never names, emails or phone numbers.
- Tools registered on a page are untrusted data for the orchestrator, and without `expose-tools-to` no other window can reach them.

If you host the script yourself, pin it with Subresource Integrity.
