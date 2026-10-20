---
title: WordPress plugin plan
---

# WordPress plugin plan

Plan for going to market fast (2026-10-19). **Proposed, not implemented.** Two pieces: paid models behind the agents, configured per agent in the admin panel, and a WordPress/WooCommerce plugin that works out of the box: install it, paste the key, done. The admin panel and the API are hosted by us (RUVDS); the GOAP pipeline stays.

## Why paid models

Small local models give weak results on real sites. The pipeline (GOAP planner, intents, guards, the browser round trip) stays as it is; what changes is the models behind the agent roles. Any OpenAI-compatible provider works; OpenRouter gives all of them behind one key.

| Agent | Role | Candidate | Why |
|---|---|---|---|
| beta-text | replies | `google/gemini-2.5-flash` or a cheaper Qwen | multilingual, good text |
| delta-function-call | tool arguments | `qwen/qwen3-30b-a3b-instruct-2507` | the 2507 family won our delta benchmark (qwen3-4b-2507: 82–85% on 34 cases); no thinking to switch off; `structured_outputs` at 3 providers; $0.09/$0.30 per 1M tokens |
| gamma-decision (Laya) | typed decisions | stays local | its own protocol, no paid equivalent; an LLM-backed `DecisionAgent` adapter is PO-8 |

Arch-Function (trained for schemas) is not hosted anywhere and its license needs a separate commercial grant; Phi-4 has one provider and a 16k context. Before switching, run `bun tools` (`apps/benchmark`) against the candidate on the same 34 cases.

## Agent settings in the admin panel

The admin panel already lists the agents with their status (`GET /v1/admin/agents`). Each agent gets its own settings page:

- **Source**: local / external (OpenAI-compatible).
- **Base URL, model name, API key.** One key per provider, entered once (for example "OpenRouter") and picked by the agents that use it, not pasted into every agent.
- **Parameters**: temperature, reasoning effort, extra request-body fields. For delta on OpenRouter that means `provider: { require_parameters: true }`, so requests only go to providers that honour `response_format`.
- **Test**: one call with the effective settings, showing the answer and the latency.

**Defaults come from env.** Today's variables stay the source of the defaults: `LLM_BASE_URL`/`LLM_API_KEY`/`LLM_MODEL` for beta-text, `FUNCTION_CALL_*` for delta, `LAYA_*` for gamma. A field left empty in the admin panel means "the env value" and the page shows it as such; emptying a field clears its override. A fresh install works with env alone, as now.

How it is built:

- **Storage**: a table in the orchestrator's DB (agent id, source, base URL, model, provider key reference, parameters JSON, `updatedBy`, `updatedAt`). Provider keys are encrypted (AES-GCM, the encryption key from env); the admin panel only ever shows a mask.
- **API**: `GET`/`PATCH /v1/admin/agents/:id` in the orchestrator (`ADMIN_API_KEY` + `X-Admin-Id`, like the other admin routes), proxied by admin-api; the contract goes into [Admin API](/docs/drafts/admin-api/).
- **No restart**: agents are built from the effective settings at startup and rebuilt when an admin saves (one process, the same invalidate pattern as `ChannelDirectory`). A run already going keeps the agent it started with.
- **Health and accounting**: the `/health` check and `llm_calls` (`provider`, `model`) use the effective settings, so the admin panel shows which model really answered.
- Settings are per agent for the whole instance; there are no per-channel model overrides.

### Guard

- Tools carry WebMCP `annotations`. A tool without `readOnlyHint: true` is a write. For launch: cart writes run without asking (the visitor sees the cart change and can undo), and **nothing places an order**: the plugin has no checkout tool, only "open the checkout page". Approval gates in the widget (PO-12) come next.
- The plugin's tools are fixed and known, so the plugin ships intents and annotations for them and a plugin channel needs no Laya classification of its catalog (relates to PO-14 and PO-23).
- Tool answers and product descriptions are untrusted input (prompt injection) for the paid models too; the guard does not depend on a model obeying its prompt.

### Costs and privacy

- Every message now costs money: a beta-text call, plus a delta call per tool with parameters. Watch it through `llm_calls`; a budget per agent or channel is PO-8.
- Messages go to a third party (OpenRouter and the model's provider). That has to be said on the plugin page and in the privacy notes. Local models stay the private option for self-hosting.

## The WordPress plugin

### What the owner does

1. Installs the plugin, opens its settings page.
2. Pastes the publishable key (and the agent URL, prefilled with our hosted orchestrator).
3. The widget shows on every page. With WooCommerce active, the shop tools are on too.

For "paste the key and it works", the key's channel must already allow the site's origin (`allowedOrigins`). For launch we create channels by hand with the origin; self-service signup is a later step.

### Plugin structure

- A separate app in the repo (PHP, GPLv2+, as wordpress.org requires; the bundled widget is BSD, which is compatible). As a new app it gets its own `CLAUDE.md` and a line in [Architecture](/docs/drafts/architecture/).
- The widget bundle is shipped inside the plugin, not loaded from a CDN (wordpress.org discourages remote scripts).
- `wp_footer` renders `<pleiades-chat agent-url publishable-key …>` with the settings (position, greeting, heading).
- `customer-context` (already supported by the widget and the orchestrator as `customer:*` facts) carries what the page is about, flat:
  - `page_type`: `product` / `category` / `cart` / `checkout` / `page` / `post`;
  - `product_id`, `product_name`, `product_price`, `currency` on a product page;
  - `category` on a category page;
  - `cart_count`, `locale`.
- A small JS file registers the WebMCP tools through `document.modelContext.registerTool` after the widget installs its polyfill (the load order has to be checked: the widget may need to expose a ready event).

### Tools

All of them run in the visitor's browser, same origin, with the visitor's own cart session. WooCommerce tools call the **Store API** (`/wp-json/wc/store/v1/…`): products are public `GET`s; cart writes need the `Nonce` header, which the plugin prints into the page (`wp_create_nonce('wc_store_api')`) and refreshes from each response.

| Tool | Store API / WordPress | Read only |
|---|---|---|
| `get_current_product` | the product data the plugin prints into a product page | yes |
| `search_products(query, category?, min_price?, max_price?, on_sale?, page?)` | `GET /products?search=…` | yes |
| `get_product(id)` | `GET /products/{id}`: description, attributes, variations, stock, price, rating, link | yes |
| `list_categories()` | `GET /products/categories` | yes |
| `get_cart()` | `GET /cart` | yes |
| `add_to_cart(id, quantity, variation?)` | `POST /cart/add-item` | no |
| `update_cart_item(key, quantity)` | `POST /cart/update-item` | no |
| `remove_cart_item(key)` | `POST /cart/remove-item` | no |
| `open_page(url)` | same-origin navigation only (product, cart, checkout) | no |
| `search_site(query)` | `GET /wp/v2/search` (pages, posts) | yes |
| `get_page(id)` | `GET /wp/v2/pages/{id}` or `/posts/{id}`: content as text | yes |

Without WooCommerce only `search_site`, `get_page` and `open_page` are registered, so a plain WordPress site gets an assistant over its own content.

Things to check while building:

- **The theme's mini cart.** After a Store API write, classic themes do not update their cart fragment by themselves (trigger `wc_fragment_refresh`); block themes read the `wc/store/cart` data store and need it refreshed. Test both a classic theme and a block theme.
- **Navigation during a turn.** `open_page` reloads the page and the widget with it. The navigation should be the turn's last step, and the widget has to restore the conversation after the reload. Check what happens today on the Basketful demo.
- **Variable products.** `add_to_cart` needs the variation attributes; `get_product` must return them in a form the model can copy (attribute name + allowed values).
- **Caching plugins.** A page cache can serve a stale nonce or product data to another visitor. The nonce and the cart must come from a request that is not cached (the Store API sends it back in a response header).

## Product consultation: RAG or our own MCP server?

The widget sends the page path but does not know what product is open. `customer-context` + `get_current_product` fix that directly: the model knows the product id, name and price at once, and reads the full card (description, attributes, variations, stock) through a tool. Most consulting questions ("what is it made of", "does it come in blue", "how does it compare to X", "is it in stock") are answered from structured data through tools. **No RAG is needed for launch.**

RAG becomes useful for:

- **Semantic catalog search**: "a gift for a five-year-old under 50": the Store API search is keyword-based. A paid model compensates partly by turning the request into keywords and trying several. Real semantic search is PO-16 (sqlite-vec + embeddings).
- **Unstructured content**: delivery and return policies, FAQs, blog posts. For launch `search_site` + `get_page` (WordPress's own keyword search) is enough; embeddings later.

**A server-side MCP for WordPress is not needed for launch.** WooCommerce's own MCP integration (the WordPress Abilities API and MCP Adapter) is built for store management: it authenticates as a WordPress user with an Application Password, and its abilities check capabilities like `manage_woocommerce`. That is an admin's tool, not a shopper's. The browser tools above act as the visitor, with the visitor's cart, which is what a shop assistant needs. A server-side MCP becomes useful when the shop wants the same assistant where there is no browser (Telegram, a messenger): then the orchestrator needs per-channel server MCP tools (the `channels.mcp_servers` idea in [the audit](/docs/drafts/audit-2026-10/#Service-modularity)), served by read-only abilities of our plugin or the public Store API.

## Demo in the playground

The VPS (RUVDS, about 350 MB of RAM) is enough for the admin panel and the API, not for a real WordPress with PHP and MySQL. WordPress on Vercel is no way out either: the only ready option (ServerlessWP) is experimental, its quick deploy uses a temporary SQLite that expires in days, a persistent MySQL has to live elsewhere, and requests are capped at 60 s.

**Decision (2026-10-19): the demo store is published on Wasmer Edge** (it has a free plan with WordPress hosting): a real WordPress + WooCommerce with our plugin, embedded in the playground by its URL. Its origin goes into the demo channel's `allowedOrigins`, and the plugin exposes its tools to the playground's origin (`exposeToolsTo`). Wasmer's free-plan limits (CPU, storage, sleeping) are not checked yet. WordPress Playground below stays the fallback.

A static export of WordPress does not work for a shop: the cart and the Store API need PHP on every request. **WordPress Playground** does: PHP and WordPress compiled to WebAssembly run in the visitor's browser, with SQLite in memory. The server only serves files.

- **A blueprint** (a JSON list of steps) builds the demo store on every load: install WooCommerce, install our plugin from its zip, import products, set the channel key, sign in. WooCommerce's own sample products are clothing with variations (size, colour): a domain other than Basketful, and the hardest case for `add_to_cart`.
- **Every visitor gets their own store** in their own browser: no shared state, nothing to break for others, a clean store after a reload.
- **Hosting**, two options:
  - our blueprint on `playground.wordpress.net` (`?blueprint-url=`): nothing on our server; the channel's `allowedOrigins` gets that origin; the plugin zip must be served with CORS;
  - self-hosted Playground files next to the docs site (the docs release the VPS already serves as static): our own origin, but tens of MB more on disk and in traffic.
- To check first: the playground's widget panel sits outside the demo iframe and reaches the tools through the polyfill bridge (`allow="tools"`, `exposeToolsTo`), while Playground runs WordPress in nested iframes behind a service worker. If the bridge does not reach through, the demo uses the widget the plugin itself renders inside WordPress, as on a real site. The first load (WordPress + WooCommerce) takes seconds and needs a loading screen. Step names and the path of WooCommerce's sample products must be checked against the blueprint schema.
- Playground cannot reproduce caching plugins, real themes in the wild or many concurrent sessions. Those are tested by hand on a real WordPress before release.

## Cloud subscription and billing

The paid offer: our hosted orchestrator with paid models, for a monthly fee. For launch, **one monthly plan at $20** (the price will be revised). Spending limits are set by hand in OpenRouter for now; the orchestrator does not enforce them.

### Landing

- A third card in the pricing block next to "Community" and "Business": **"Cloud"**, $20 per month, what is included (the hosted agent, the WordPress plugin, paid models), and a Polar checkout link. Copy in en/ru/kk (`apps/docs/src/lib/landing/content.ts`), the link next to the license one in `apps/docs/src/lib/site.ts`.
- The privacy note for this plan: messages go to the model providers through OpenRouter.

### Polar automation

- A monthly subscription product in Polar. Polar is already used for the commercial license.
- **A webhook receiver** in the orchestrator (it owns the DB and is already public for the widget): `POST /v1/billing/polar`, secret `POLAR_WEBHOOK_SECRET`. Polar signs with the Standard Webhooks scheme (`webhook-id`, `webhook-timestamp`, `webhook-signature`, HMAC-SHA256): verified in a few lines with `crypto`, against the raw body, rejecting old timestamps. Idempotent by `webhook-id`.
- Events: `subscription.created`, `subscription.active`, `subscription.updated`, `subscription.cycled` (a new period: new `current_period_start`/`current_period_end`), `subscription.canceled` (`cancel_at_period_end`), `subscription.uncanceled`, `subscription.revoked`, `subscription.past_due`. `order.paid` only to log the payment.
- **Storage**: a `subscriptions` table: Polar subscription id, customer id and email, product, status, `started_at`, `current_period_start`, `current_period_end`, `cancel_at_period_end`, `ended_at`, the linked channel, `updated_at`. The payload is the source of truth: every event overwrites the row with the subscription's current fields, so out-of-order events do no harm.
- **Linking to a channel.** For launch: the owner buys on the landing, the subscription appears unlinked with the buyer's email, and we create the channel and link it by hand in the admin panel. Later: pass the channel or account id through the checkout (Polar checkout metadata or an external customer id; to be checked) and link automatically.

### Admin panel

- **A "Plans" tab**: every subscription with its customer, plan, status (active / cancels at period end / past due / ended), **when it started and when it expires** (`current_period_end`), the linked channel, and a link to the subscription in Polar. Filter by status; "expires in 7 days" first.
- The channel page shows its plan and expiry date.
- Nothing is blocked automatically when a plan expires: the panel shows it, and we disable the channel by hand for now.

### Token prices on the dashboard

- **Prices per model**: for each model the agents use, the price per 1M input and output tokens, read from OpenRouter's public model list (`GET /api/v1/models`, `pricing`), cached for a day. Local models cost 0.
- **Spend**: tokens from `llm_calls` × price, by day, channel and model, next to the existing usage numbers. Shortcut: today's price applied to past tokens; store a price per call (the `costUsd` of PO-8) when it matters.
- If OpenRouter returns the cost in `usage` (not checked), store it per call and show the real figure instead of the estimate.

## Phases

Status 2026-10-19: phase 3 is implemented (webhook, `subscriptions`, Plans tab, prices and spend, Cloud card). Open: the real Polar checkout link in `apps/docs/src/lib/site.ts`, `POLAR_WEBHOOK_SECRET` and `POLAR_DASHBOARD_URL` on the hosted instance, a test delivery from Polar.

1. **Agent settings** in the orchestrator and the admin panel: the table, the routes, rebuilding agents on save, env as the default. Then a `bun tools` run for the delta candidate and switching beta-text and delta to paid models on our instance. Test-first: a saved override wins over env, an empty field falls back to env, a key is never returned in clear.
2. **Plugin MVP**: settings page, bundled widget, `customer-context`, the read-only tools and the cart tools, nonce handling, the mini-cart refresh. Tested on a local WordPress + WooCommerce (a compose profile) with a classic and a block theme, and on products from different domains (clothing with variations, electronics), not only groceries.
3. **Billing**: the Polar product and webhook receiver, the `subscriptions` table, the "Plans" tab, model prices and spend on the dashboard, the "Cloud" card on the landing. Test-first: signature check (valid, tampered, stale), replayed `webhook-id`, out-of-order events.
4. **Playground demo**: the WooCommerce store with our plugin on Wasmer Edge, sample products from another domain, the widget reaching the tools from the playground.
5. **Launch blockers**: the security issues that matter once the admin panel and the API face the internet (PO-21, PO-22, PO-26, the relevant parts of PO-32), the overload behaviour (PO-37), a hosted orchestrator for "paste the key" (relates to PO-11).
6. **After launch**: automatic channel linking from the checkout, blocking expired plans, approval gates and handoff to a human (PO-12), budgets and fallbacks (PO-8), per-channel profiles (PO-15), semantic search (PO-16), self-service signup, a wordpress.org listing.

## How this changes current issues

| Issue | Change |
|---|---|
| PO-12 (WooCommerce plugin, approval gates, handoff) | The plugin part is this plan; approval gates and handoff stay after launch. |
| PO-8 (ModelRouter, cloud fallback for delta) | For launch: per-agent model settings in the admin panel with env defaults. Fallbacks, budgets and the LLM-backed Laya adapter after. |
| PO-41 (intent packs) | Still needed for non-shop sites; plugin channels use the built-in shop intents. |
| PO-14, PO-23 (catalog compilation and classification) | Not needed for plugin channels: the plugin ships intents and annotations for its tools. |
| PO-11 (quickstart) | The hosted orchestrator for plugin users comes first; the self-host quickstart after. |
| PO-16 (embeddings) | Semantic product search after launch. |
| PO-21, PO-22, PO-26, PO-32, PO-37 | Launch blockers or near it, see phase 3. |

Not checked while writing: whether OpenRouter returns the cost in `usage`, how delta behaves on OpenRouter with the `chat_template_kwargs` it always sends, the widget's polyfill load order for a plugin that registers tools, and which audit P0 findings are already fixed in code.
