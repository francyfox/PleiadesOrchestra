# pleiades-widget

A chat widget for sites connected to PleiadesOrchestra: one framework-agnostic web component, `<pleiades-chat>`. A round launcher button sits in a corner of the page (bottom-left by default) and opens a side panel with the chat. Vanilla TSX, no runtime dependencies, **under 10 kB brotli** (enforced by [size-limit](https://evilmartians.com/opensource/size-limit) in `bun run build`).

## Use it

```html
<script src="pleiades-widget.js" defer></script>

<pleiades-chat
  agent-url="https://agent.example.com"
  publishable-key="pk_..."
></pleiades-chat>
```

Or from a bundler: `import "pleiades-widget"` (it registers the element; there are no exports). The element works the same inside React, Vue, Svelte or plain HTML.

| Attribute | Default | |
| --- | --- | --- |
| `agent-url` | — (required) | Base URL of the orchestrator. `https` only (plain `http` is accepted for `localhost` only). |
| `publishable-key` | — (required) | The channel's `pk_…` key from the admin panel. |
| `position` | `bottom-left` | Launcher corner: `bottom-left`, `bottom-right`, `top-left`, `top-right`. The panel slides in from the same side. |
| `heading`, `greeting`, `placeholder` | localized | Panel title, first bubble, input hint. |
| `lang` | page language | `en`, `ru` or `kk`; anything else is English. |
| `open` | absent | Boolean; also a property: `el.open = true`, `el.toggle()`. |

Theming: set `--pleiades-accent`, `--pleiades-bg`, `--pleiades-fg` on the element. The widget lives in a shadow root, so the host page's CSS can't break it.

`el.getVisitorToken()` returns the visitor token of this browser, for the site's server-side `POST /v1/channels/:slug/identify` call (links an anonymous visitor to a logged-in account).

Invalid configuration renders nothing and logs one `[pleiades-widget] <code>` line to the console (`missing_agent_url`, `invalid_agent_url`, `insecure_agent_url`, `missing_key`, `secret_key`, `invalid_key`). An origin the channel doesn't allow shows up as a network error: the server answers `403` without CORS headers, so the browser hides the reason.

## Types

The package ships TypeScript declarations (`types/`): the element interface, its attributes, and `HTMLElementTagNameMap`, so `document.createElement("pleiades-chat")` and `querySelector("pleiades-chat")` are typed in any project. For React JSX, import the augmentation once anywhere in the project:

```ts
import type {} from "pleiades-widget/react";

<pleiades-chat agent-url="https://agent.example.com" publishable-key="pk_…" position="bottom-right" />
```

`bun run check-types` compiles `types-test/`, which checks that the declarations accept the real API, reject misuse, and stay in sync with the class.

## Which key goes where

| Key | Looks like | Where it goes | Visible to visitors? |
| --- | --- | --- | --- |
| **Public** (publishable) | `pk_…` | The page: `publishable-key` of `<pleiades-chat>`, or a `VITE_…`/`NEXT_PUBLIC_…` variable that feeds it. | Yes, by design. |
| **Secret** | `sk_…` | The site's **server** only, for `POST /v1/channels/:slug/identify` (`Authorization: Bearer sk_…`). | **Never.** The widget refuses to start with one and tells you so in the console. |

The admin panel labels both on the Channels page; the secret key is shown once, when a channel is created or its keys are rotated. If a secret key ever ended up in a page or a client bundle, rotate it ("New keys").

## Security model

There is no secret in the page. The key is a *publishable* one, public by design; what actually protects the channel is enforced by the orchestrator (`docs/admin-api.md`, "Widget API"):

- **Origin allowlist** — every request must come from an origin listed on the channel; a browser can't fake `Origin`, so a copied key is useless on another site.
- **Visitor token** — the key is sent once, to get a random token (stored hashed server-side, sliding 24 h expiry). Every later request carries only the token, never the key.
- **Limits** — per-token and per-IP rate limits, IP blocks, a message length cap.

The widget adds:

- it refuses to start with a **secret key** (`sk_…`): such a key is for the site's backend and one in a page is already leaked;
- it refuses a plain-`http` agent URL (except `localhost`), so the token never travels in clear text, and a URL with embedded credentials;
- requests are sent with `credentials: "omit"` and `cache: "no-store"` — no cookies, nothing cached;
- the token and thread id are kept in `localStorage` under a name derived from agent URL + key (two sites never share a session), dropped when expired or refused (`401` → a fresh visitor), and never logged; storage that throws falls back to memory;
- all message text is set with `textContent`, never as HTML.

Pin the script with Subresource Integrity if you host it yourself, and don't put the token anywhere the page doesn't already trust.

## Develop

```bash
bun test src          # logic in src/lib: config, storage, API client, chat
bun run check-types
bun run lint
bun run build         # dist/pleiades-widget.js, then the 10 kB size check
bun run dev           # vite on :5199
```

`src/lib` is UI-free (config validation, session store, Widget API client, chat state machine) and unit-tested; `src/ui` is small TSX components on a ~400-byte JSX runtime (`ui/jsx.ts`) that builds real DOM nodes; `src/element.ts` connects attributes to both. Styles are `ui/styles.css`, written with nesting and compiled by PostCSS (`postcss-nested`, `cssnano`).

Why not Svelte: an empty Svelte 5 custom element is already ~11 kB brotli, Svelte 4 leaves ~6 kB for everything else. A message list doesn't need virtualization either — the server keeps only the last 10 messages per visitor.
