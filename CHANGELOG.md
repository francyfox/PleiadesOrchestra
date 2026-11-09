# 0.14.10 - 9 Nov 2026

Feature:

- Guardrails: an optional prompt-injection filter (regex rules, OWASP defaults, off by default) runs before any model call; a blocked message gets a fixed refusal and shows as a failed request in the flow. `/v1/messages` text is capped like the widget's. The admin has a page with a rules editor.
- Notifications: webhooks with event subscriptions (`run.failed`, `guardrail.blocked`, `ip.blocked`, `balance.low`, `balance.depleted`), scoped to the owner for customers (balance events for owners only). Types: JSON (HMAC-signed), Discord, Slack and Telegram; SSRF guard; migrations 0031-0034.
- Admin: the header stats are a setting (off by default); the recommendations page is gone.
- WordPress plugin `pleiades-chat` 0.5.0 (renamed from `pleiades-assistant`; Plugin Check reports no errors or warnings): split into classes with PHPDoc, a settings page with General and Localization tabs (every locale and UI string of the widget, in English and Russian), an External services disclosure with terms and privacy links, the hosted agent as the default agent URL, `search_products` opens the shop's results page, every tool failure is a code from a closed list instead of the shop's text, and limits on how much one tool call can add to a cart (20 per add, 99 per cart line, 12 servings, 100 units per call; filter `pleiades_chat_limits`).
- Widget 0.6.0: a `labels` attribute (JSON) overrides any UI string of the locale, and the widget dispatches `pleiades:turn-start` / `pleiades:turn-end` on `document`, so a host page can wait for a turn to end before it navigates.
- Tool errors: a closed `ToolErrorCode` list (missing argument, not found, not purchasable, out of stock, variation required, invalid quantity, cart item gone, not allowed, network, nonce expired, limit exceeded, unknown) with a reply template per code in en, ru and kk; a tool's or a shop's own error text never reaches the chat.
- Flow: at most 10 cart writes per run; the next one is not sent to the browser and the reply says it is more than can be added at once (`LIMIT_EXCEEDED`).
- Tests: browser tests (Playwright) drive the real WordPress + WooCommerce shop: every tool of the plugin through `document.modelContext` (the polyfill and Chrome's own), prompts that cross page reloads, the settings page, the security cases and the cart limits (`bunx playwright test wordpress` in `apps/e2e`; skipped when no shop is running).

Changed:

- Tools: `open_page` returns first and the page reloads only after the widget turn ends, so the next step of the run is no longer lost to the reload.
- Plugin: the bundled widget and the plugin share one list of locales and strings (generated from the widget's `i18n.ts` at build time).

Fixed:

- Flow: a tool whose name says `open` or `visit` (`open_page`) is a navigation, so the assistant opens the page instead of telling the visitor to go there.
- Flow: a bare buy verb ("buy", "купи") with nothing remembered asks which product instead of searching for the verb, and a placeholder id (`0`, empty, `undefined`) is never sent to a tool.
- Plugin: a product shown on the home page was missed when the search was strict or filtered by a wrong category; it now retries without the category and by single words.
- Plugin: `update_cart_item` with quantity 0 removes the item; a failed tool returns its reason as a result (Chrome's WebMCP replaced a thrown message with "invocation failed").
- Plugin: password-protected recipes and kits no longer leak into the page config or the recipe page; recipe meta has limits (servings, quantity, 100 ingredients); a non-string agent URL no longer throws; the recipe and kit lists are cached for an hour (267 queries per page before).
- Services: an id with a slash in a path (a local model's price `vendor/model`, a thread id) reaches the route whole again on Elysia 1.4.31, which no longer decodes `%2F`; `createKitApp` decodes it for every service.
- Admin: the time zone picker no longer crashes in Firefox, which lists "UTC" itself (a duplicate option broke the keyed list). The panel's source maps go to Sentry from CI.

Chore:

- WordPress: a Kadence demo shop with product pictures for local checks (`WORDPRESS_THEME=kadence`); WooCommerce's coming-soon mode is switched off by the setup.
- Docs: CI pings IndexNow with the sitemap after each deploy; a Yandex verification meta.
- Dependencies: Elysia 1.4.31 (not 2.0), Biome 2.6.6, Sentry 11.11 and the Svelte, Vite and Tailwind patches; TypeScript stays on 6 (SvelteKit's tooling needs `ts.sys`).
- Lint: Biome 2.6 with every warning fixed, Markdown frontmatter parsing on, `.md` and `.yml` formatted.
- CI: Turborepo Remote Cache for lint, types and tests (`TURBO_TOKEN` secret, `TURBO_TEAM` variable); the deploy workflows stay without it.
- Dev: `.zed/settings.json` makes Zed use Intelephense for PHP (no `php` on the host); `bun run --cwd packages/wordpress-plugin stubs` fetches the WordPress and WooCommerce stubs for editor hints.

# 0.13.10 - 6 Nov 2026

Feature:

- Admin: every account has a time zone (customers pick it at sign-up, prefilled from the browser, and in `/settings`; staff change an admin's on `/admins`; default UTC for existing accounts, migration `0003_account_time_zone`). The picker shows the UTC offset and searches by it ("5", "+5:30") and by name. All dates in the panel are formatted by date-fns in the viewer's zone.
- Admin: a customer sees spend on the dashboard and in the monthly table of Billing in trenni (TR); staff keep dollars on the dashboard.
- Billing: a customer's balance, the plan and the paused alert update over the WebSocket (new live topic `billing`) instead of once a minute.
- Admin: the channel's allowed origins are site URLs (`https://shop.example.com`, one per line); a value with a path, a trailing slash or no scheme is refused by the form and the API. The channels table fits a desktop: URLs and access mode as chips, the name, plan and key are cut, and every cut table cell shows its full text on hover.
- Landing: Privacy Policy, Terms of Use and Refund Policy (`/privacy/`, `/terms/`, `/refund/`, with `/ru/` and `/kk/`), in a new "Legal" footer column and the sitemap. The Terms say plainly that the service is provided as is, with no warranties, and follow the legislation of the Republic of Kazakhstan.
- Landing: the navigation links live in the burger menu below 1024px (the inline row only from `lg`, no width shows both or neither).
- CLI: every release attaches standalone `albedo` binaries for Linux (x64 and arm64, glibc and musl) and macOS (x64 and arm64) with a checksums file.
- CLI: `albedo` is built into the `ghcr.io/francyfox/pleiades` image (`docker exec pleiades albedo help`; `admin:create` finds the admin API itself: the image's own binary inside it, the `pleiades` container of the one-command install, else the compose service), and the docs have a CLI page with the commands.
- CLI: `albedo -v|--version` prints the version (`PLEIADES_VERSION` in `.env`, else the built-in one), `albedo help` / `-h` prints the commands with their options, and every command has a shortcut (`s`, `r`, `ac`, `e`, `h`).
- Docs: a CLI page (`/docs/cli/`, also in ru and kk): where to get `albedo`, its environment variables and the commands with their shortcuts.
- Docs: the Server API page tells where the Swagger reference is: public at `albedo.shalotts.site/swagger`, locally at `localhost:3000/swagger` (admin API: `localhost:3003/api/docs`).

Changed:

- Billing: a request holds 0.001 TR (was 0.05), so a small balance still serves requests.
- Admin: the low-balance banner says channels stop when the balance cannot cover a request, not "at zero"; the delete-account warnings say the subscription ends at once and the balance is lost.

Fixed:

- Flow: a request the browser never answered no longer leaves its step "in the browser" with a clock that keeps running: the step is failed ("the browser did not answer") with the 60 s wait that ended it, and the view stays the same on later reads.
- Understanding: a greeting, a laugh or a bare "ok" after a reply that asked nothing (an action done, a hint) is no longer rewritten into the earlier action ("hi" added the last product to the cart again, "haha" searched for it). The assistant's reply is quoted to alpha-understand only when it asks something or offers a numbered choice.
- Billing: a client that cancels the stream no longer frees the request's hold before the run it left behind is debited, so parallel requests cannot overspend the balance through a cancel.

Chore:

- Landing: component styles moved from `<style>` to Tailwind utilities (the landing renders pixel for pixel the same at 390, 768, 1024 and 1440px); `<style>` stays only for keyframes, `:global` rules and the theme's own selectors.
- Eval: `eval:answers` has a `noise` kind: 8 cases of greetings and fillers after an action done or a hint, so this miss is caught.

# 0.12.10 - 6 Nov 2026

Feature:

- Billing: a top-up credits its price net of payment fees, payout, tax and conversion, minus a staff margin (`marginPercent`, default 0, previewed in the admin settings). The credited amount is stored per order, so a refund takes back exactly what was granted. Old and non-USD orders keep the face-value behavior.
- Usage: provider prompt-cache hits are recorded and billed at the cache price instead of the full input price.
- Usage: local models get staff-set prices (USD per 1M tokens) on the admin preferences page; an explicit local price wins over OpenRouter's.
- Pricing: public `GET /v1/public/pricing` (open, cacheable) returns what a $5/10/20/50 top-up gives and the price per 1M tokens of the models in use; only "fees and taxes" and "service" are shown, the staff tax setup stays private.
- Landing: the pricing section shows the top-up table and a price list of models in a modal; nothing extra renders if the API is unset or unreachable.
- Admin: the orders table shows credited TR and the fees/taxes/service difference per order.

Changed:

- Usage: a failed model call (`ok = false`) is still recorded but no longer debited, and spend reports skip it to match the ledger.

# 0.11.10 - 4 Nov 2026

Feature:

- Landing: the Cloud plan is open: its button leads to the panel's Billing page (was a disabled "soon").
- Admin: signing in returns to the page asked for. An anonymous visitor of `/billing` (or any page) lands on the customer sign-in with `?redirect=`, and after signing in goes back there; staff pages send to the staff sign-in. Only paths of this site are followed. The redirect survives switching between sign-in and registration.

Changed:

- Admin: access is decided by route guards in the Angular `canActivate` style (`lib/guards.ts`) on route groups `(shared)`, `(customer)`, `(staff)`, `(auth)` instead of one list of paths. URLs are unchanged.
- Admin: an anonymous visitor of `/` now gets the customer sign-in; staff open `/login` directly.
- Admin: every in-app link goes through SvelteKit `resolve()`, so a wrong path is a type error.

# 0.10.10 - 4 Nov 2026

Feature:

- Billing: the balance ledger is kept to the nano-USD (1 TR = 10^9), so a model call loses at most $0.000000001 to rounding (was $0.000001). Existing amounts are migrated (`0028_ledger_nano_usd`).
- Billing: a discounted Polar order tops the balance up by its price before the discount; a 100% code no longer gives a plan with 0 TR. A refund takes back its share.
- Admin: staff can change a user's balance (signed TR, recorded with the admin's id) and grant or end a plan outside Polar, from the user's Billing dialog.
- Admin: `/users` shows each user's balance, sorts by any column and searches by email (state in the URL).
- Admin: balances show 5 decimals with the exact value in a tooltip; the spend chart and the finance tiles show the exact amount on hover; long amounts are cut with an ellipsis.
- Admin: users whose channels are paused for want of balance see a "short on fuel" dialog with a Top up button.

Chore:

- Removed the Cloudflare `tunnel` compose service and its config; public traffic needs your own reverse proxy.

# 0.0.1 - 1 Nov 2026

Feature:

- Created common Pleiades container for docker. (one line install script)
