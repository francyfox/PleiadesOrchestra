# pleiades-widget internals

See root `CLAUDE.md` for monorepo commands, workflow, code style and repo-wide lessons.

## Overview

Framework-agnostic `<pleiades-chat>` web component: launcher in a corner (default bottom-left) + side panel. **Size budget: 40 kB brotli** (raised from 10 kB when moving to Alpine.js), checked by `size-limit` inside `bun run build` — 38.9 kB now (anime.js dropped; motion is the Web Animations API, `el.animate`, in `components/motion.ts`).

Alpine.js **CSP build** (`@alpinejs/csp`) is bundled into the IIFE; PostCSS-compiled nested CSS (`postcss.config.js`). The CSP build is deliberate: third-party sites often forbid `unsafe-eval` which standard Alpine needs. Templates may only use property and method names (no inline logic) — every decision lives in a plain model object, unit-tested without a DOM.

Ships typings (`types/index.d.ts` with `HTMLElementTagNameMap` entry, `pleiades-widget/react` for React JSX; checked by `types-test/`). No wrappers for React/Vue/etc. needed — React 19, Vue 3, Svelte, Solid, Angular use web components natively.

## Layers and components

```
src/lib/          # UI-free, unit-tested: config validation, session store, API client, chat controller
src/components/   # UI components
src/element.ts    # attributes → lib + ui
```

Each component has its own directory: `<name>.model.ts` (pure logic + tests), `<name>.template.ts` (static HTML string with the component's own `x-data` scope), `<name>.motion.ts` (Web Animations API, only where it moves), `<name>.ts` (binds model + template via `defineComponent` from `component.ts`).

Components: `launcher`, `header` (language picker: a native `<select>` laid transparently over the Lucide "languages" icon, so the listbox, keyboard, outside click and Escape are the platform's), `messages`, `error-line`, `composer`, `footer` (static, no model), `panel` (frame + slide). Components never share a model — `widget/widget.ts` assembles them, hands each its slice of chat state in `render(state)`, starts Alpine per widget with `Alpine.initTree(el)` (never `Alpine.start()` which would scan the host page).

Shared: `motion.ts` (`play`, `reduced`), `icons.ts`.

Imports: `@/...` = `src/...` — tsconfig `paths` for tsc/bun, `resolve.alias` regex `^@/` in `vite.config.ts`. Keep both.

## State and security

Nothing from the page (heading, greeting, texts) is spliced into the template string — it all goes through `x-text`/bindings.

Security: only `pk_` key accepted (`sk_` refused), `https` only except localhost, credentials omitted, text via `textContent`. An origin the channel doesn't allow surfaces as a network error (403 without CORS headers).

**The widget sends the visitor's current page** (`pathname + search`, ≤512 chars, no origin/hash) with every message **and every tool result** (a tool may navigate). Orchestrator writes `page:path`/`page:lang` facts. `parsePage`/`samePage` in `packages/core/src/goap/page.ts` ignore language-in-path and tracking params; compare other query params as a set. A navigate-intent tool whose destination is the current page is not sent to the browser.

**Widget errors**: three types emitted by the server — `network` (no answer, locks composer), `request` (terminal `error` with `code: "task_failed"`, shown as `s.request` + `hint` ≤400 chars, never locks), `failed` (other server fault). The typing dots show only on the newest assistant bubble while `state.busy` (`bubbleViews(messages, busy)`).

**Suspended channel**: `402` (`channel_suspended`, the site owner has no plan or balance) maps to the terminal `ChatError` `suspended`: neutral text (`strings.suspended`, never billing details), composer locked like `forbidden`.

**Language** — the widget owns it: the visitor's pick in the header (`store.loadLang`/`saveLang`, key `<session>:lang`, per site) > the `lang` attribute > `<html lang>` > `navigator.language`, first one the widget supports (en/ru/kk), else en (`pickLang`). `createWidgetApi({ language })` is read at every request and adds `lang` + `langChosen` (true only for a pick) to every message and tool result; the server writes steps and the reply in it. A switch rebuilds the UI over the same chat (`element.ts` `#renderUi`; the thread stays). Server step lines exist in ru/en only: kk shows Russian steps.

**Tool mode** is fixed to WebMCP (`// shortcut: tool mode fixed to webmcp, upgrade when the channel setting (cabinet/admin) exists` in `chat.ts`); the switch was removed. `noTools` = no WebMCP provider.

**Flow lines** (step events) survive a reload — attached to a reply message via `plan_runs.steps` (JSON), fetched by `GET /v1/widget/threads/:id/messages` (`threadMessages`). Widget maps `item.steps` onto `ChatMessage.steps`. A reply made only of steps must not be dropped (`hasOutput` in `chat.ts`).

**Progress bar and message times**: a message of several tasks streams `{type:"progress", done, total, current, startedAt}` (server: `progressOf` in `modules/tasks`, sent when each task starts and when the last ends, also after tool-results; never for one task). `chat.state.progress` keeps the client's own start time (server clock is only used to tell one queue from the next) and `endedAt` once the turn ends; the `progress` component sits above the composer, its live region speaks done/total only (the ticking time is `aria-hidden`), one 1 s interval runs in `widget.ts` only while it is running. Every message has a `createdAt` (history: server's, new: client's); `messages/stamp.model.ts` writes it («just now», «5m», clock, «yesterday», date) with `Intl` and one shared 60 s timer runs while the panel is open. Old widgets ignore unknown NDJSON types.

**Reply rendering** (`messages/reply.model.ts`, `parseReply`): a reply may end with `1. …` to `9. …` (2..9 items, consecutive from 1, nothing after) — that list leaves the text and becomes `options`; `[title](url)` is a link only for `http(s)` (anything else stays text), drawn as `<a target="_blank" rel="noopener noreferrer">` with the title via `x-text`. Partial streaming text is safe: an unfinished list/link stays text. The newest reply, once the turn is not busy, shows its options as buttons with a number hint and `aria-keyshortcuts`; older replies keep them as plain lines. A pick goes through `chat.send(text, ctx, undefined, replyTo)` (same path as Send): `replyTo` = the answered reply's full text, cut to 2000, sent in the `/v1/widget/messages` body and kept on the user message (`ChatMessage.replyTo`) to draw a one-line quote above its text. Keys 1-9 (`pickKey` in `messages.model.ts`, listener on the widget root): only with focus inside the open panel, an empty composer, no Ctrl/Meta/Alt/Shift, not busy, option exists; then the key is `preventDefault`ed so it doesn't type. Ctrl/Super are not used (browsers reserve them).

## WebMCP polyfill
**Unfinished work (`pending`)** — on init and when the connection comes back, `chat.checkPending` asks `GET /threads/:id/pending` (`lib/chat/pending.ts`, pure `decidePending` + `isReadTool`, a name-verb copy of the server's tool cues). A waiting call runs by itself only if its tool only reads and the page has it; any other waiting call becomes `state.notice` `resume` (Continue = run the tool and POST the result, Cancel = POST it with `cancelled: true`: the server ends the request as cancelled, no tool failure, the chat shows the neutral `notice` kind `cancelled`), because the tab may have closed after the tool already ran and a write would add twice. `interrupted`/`expired` (each told once) become a `retry` notice that re-sends the prompt as a new message, never automatically. Component `notice`; both go through `send(text, ctx, resume)` so busy/idle/error handling is shared.



Lives in `packages/webmcp-polyfill` (`@repo/webmcp-polyfill`, Apache-2.0), imported by `element.ts` as `installWebMcpPolyfill`. It is a **devDependency** (`workspace:*`) on purpose: the widget is published to npm/JSR as a single IIFE and the private package is inlined by Vite, so no `@repo/*` import may remain in `dist/` (check `grep @repo dist/*.js` after a build). The polyfill is installed at mount (a microtask after `connectedCallback`), not at script load: the widget dispatches `pleiades:webmcp-ready` on `document` right after, for pages that register tools (`packages/wordpress-plugin`); such a page also registers at once if `document.modelContext` already exists. `lib/webmcp/webmcp.ts` is separate widget code and does not depend on the polyfill. Polyfill tests/types/lint run in its own package. A tool that throws an error with numeric `status` (100–599) and optional `retryAfter` (seconds, number or numeric string) gets both into `WEBMCP_EXECUTE_TOOL_RESPONSE`; the requesting window re-validates them (`tool-error.ts`) and rethrows a `ToolCallError`.

## Automation / testing

`el.send(text)` on `<pleiades-chat>` goes through the same path as a visitor typing and pressing Send (same bubble, same WebMCP tool calls, same resume loop), opens the panel, and resolves when the turn ends: on the terminal NDJSON line (`done` / `error`, incl. `task_failed`) after all tool-call round trips. No timers.

```ts
const r = await document.querySelector("pleiades-chat").send("buy A, B, C");
// { requestId?, reply, steps: {text, phase}[], status: "done" | "failed" | "error", error? }
```

- `failed` = `task_failed` (the site could not do it; `error` = the site's advice). `error` = busy, not connected, too long, server fault, stopped. It never rejects.
- `requestId` is the `callId` of the turn's first `tool_call` line, which the server sets to the plan run id (opens admin `/flow/<id>`). The stream carries no run id otherwise, so a turn with no browser-side tool call has no `requestId`.
- `window.pleiadesChat.send(text)` exists only if the element has the `test-api` attribute (off by default, no global on production pages). The element method is always there.
- Types: `PleiadesSendResult` in `types/index.d.ts`; logic is `SendResult` in `lib/chat/chat.ts`.
- `el.resetSession()` — new thread for the same visitor, empty panel, tools re-announced (`chat.resetSession`). The orchestrator keeps session facts (`store`, `lastProduct`) per thread, so a page switching demos must call it; otherwise one demo's facts leak into the next. Keeps the visitor (a new one per switch hits the new-visitor limit). Never rejects.

## CSS gotchas

- Colours, radius, shadow and gradient in `src/components/styles.css` are hand copies of `packages/ui/src/tokens.css` (the 40 kB budget rules out importing it): change both together.

- Same-specificity CSS order matters: `.p.o` must come after the `data-pos` rules.
- A `visibility` transition delay on open makes the input unfocusable — open is instant, only close is delayed.

## Integration

`apps/shopping-cart-webmcp` (Basketful demo, nested git repo; resolves the widget through `dist/pleiades-widget.js`, so run `bun run build` in the widget after any widget change): `import "pleiades-widget"` in `main.jsx`. Env vars: `VITE_PLEIADES_URL` + `VITE_PLEIADES_PUBLIC_KEY` (only `pk_`, never `sk_` — `VITE_*` is baked into the page). Its `react`/`react-dom` are pinned to `^19.3.0`. Build the widget first, create a web channel in the admin panel with allowed origin `http://localhost:5173`, run the demo with those env vars (`--host 0.0.0.0`).

The **Embed code** dialog is in `apps/admin` (`channels/embed-dialog.svelte`, `lib/embed-snippet.ts`). The **FAQ** page (`/faq`) has Getting started (steps, widget snippet, attributes table) + Q&A (virtualized, fuzzy search via Fuse.js).
