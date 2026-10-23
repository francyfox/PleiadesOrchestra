# wordpress-plugin internals

See root `CLAUDE.md` for monorepo commands, workflow and style. Plan: `apps/docs/content/en/drafts/wordpress-plugin.md`.

## Overview

WordPress plugin `pleiades-assistant` (PHP 7.4+, GPLv2+; the bundled widget is BSD-3). Not a JS package apart from `build` and the tests of the tool logic.

- `pleiades-assistant/pleiades-assistant.php` — settings page (Settings API, `manage_options`, nonce by `settings_fields`), `wp_enqueue_scripts` (widget, tools, inline `window.PleiadesWp` config incl. the `wc_store_api` nonce), `wp_footer` prints `<pleiades-chat … customer-context>` (flat JSON facts). `PLEIADES_DEFAULT_AGENT_URL` is a **placeholder**: no hosted URL exists in the repo yet.
- `assets/tools-core.js` — pure functions on `globalThis.PleiadesWpCore` (tool list with schemas and annotations, argument to request mapping, nonce refresh, same-origin check, response shaping). Tested by `tools-core.test.ts` (`bun test`). Descriptions stay generic (any shop domain).
- `assets/tools.js` — browser wiring: fetch, `document.modelContext.registerTool`, mini cart refresh (`wc_fragment_refresh` + `wc/store/cart` invalidate), stale-nonce retry (403 -> `GET /cart` -> retry once).
- `assets/pleiades-widget.js` — copied from `packages/pleiades-widget/dist` by `bun run build` (git-ignored). `dist/pleiades-assistant.zip` is the installable plugin.

## Recipes and kits (0.2.0)

- CPT `pleiades_recipe` (public, REST, archive `/recipes/`, activation flushes rewrites). Meta, all `show_in_rest`: `servings` (int), `time_minutes` (int), `ingredients` (array of `{sku, quantity, note}`). Kit = WooCommerce **grouped** product in category `kits` with product meta `_pleiades_kit` = JSON text `[{"sku","quantity"}]` (the grouped children hold the products, the meta the quantities). SKUs resolve to products at render time; a deleted product drops out.
- `the_content` filter on a single recipe/kit prints the ingredient list (recipes) and a hidden "Add all" button (`.pleiades-add-all`, `data-items`); `tools.js` un-hides it and runs `addAll` (Store API, nonce retry). Without a widget key only core + tools load, on those pages, and `cfg.tools` is false so no WebMCP tool is registered.
- `window.PleiadesWp.recipes` / `.kits` (`{name, url, servings, time_minutes, items:[{id, name, quantity}]}`) feed `bundleTools(cfg)` in `tools-core.js`: `list_recipes`, `add_recipe_to_cart({recipe, servings?})`, `list_kits`, `add_kit_to_cart({kit})`; `recipe`/`kit` are enums of the names (core's "named options" picks them over `add_to_cart`). Servings scale quantities up (ceil); one failed item (out of stock) does not stop the rest and is listed under `missing`.
- Limit: all recipes/kits (max 100 each) are printed into every page; no caching of that query.

Without WooCommerce only `search_site`, `get_page`, `open_page` are registered. No checkout tool; `open_page` is same-origin only.

## Load order, navigation

- The widget installs the polyfill at mount and dispatches `pleiades:webmcp-ready` on `document`; `tools.js` registers immediately if `document.modelContext` exists, else on the event.
- `open_page` returns first, navigates 50 ms later, and sets `sessionStorage["pleiades-wp-open"]`; the reloaded page re-opens the panel, and the widget restores the thread from the stored session (`localStorage`, per agent URL + key) via `history()` on open. Only the last 10 messages survive. A tool result sent after navigation may never reach the server; keep `open_page` the turn's last step (its description says so).

## Local WordPress + WooCommerce

```
bun run --cwd packages/wordpress-plugin build      # widget must be built: bun run --cwd packages/pleiades-widget build
docker compose -f compose.wp.yml up -d
```

`compose.wp.yml` is its own compose project (`pleiades-wordpress`), apart from the main stack. `wordpress-setup` (`dev/setup.sh`, wp-cli, idempotent) installs core, WooCommerce, the sample products (clothing with variations), activates the plugin and, if `WORDPRESS_PLEIADES_KEY` (+ `WORDPRESS_PLEIADES_AGENT_URL`) are set in the root `.env`, presets the settings. Site `http://localhost:8088` (`WORDPRESS_PORT`), admin / admin. Re-run setup: `docker compose -f compose.wp.yml up wordpress-setup`. The plugin dir is mounted read-only, so rebuild assets on the host.

PHP lint (no PHP on the host): `docker run --rm -v $PWD/packages/wordpress-plugin/pleiades-assistant:/p php:8.3-cli sh -c 'for f in $(find /p -name "*.php"); do php -l $f; done'`.

Copy the wasmer demo shop (202 products with variations, kits, recipes; no images): `bun packages/wordpress-plugin/dev/pull-demo.ts [site]`, then `docker compose -f compose.wp.yml run --rm -T -v $PWD/packages/wordpress-plugin/dev:/dev-data:ro --entrypoint wp wordpress-setup eval-file /dev-data/import-demo.php` (~80 s, idempotent by SKU; the WooCommerce sample products stay next to it).

Theme: `WORDPRESS_THEME=storefront` (classic: cart and checkout pages become `[woocommerce_cart]`/`[woocommerce_checkout]`) or `twentytwentyfive` (block, default: WooCommerce's block pages are recreated); rerun `wordpress-setup` to switch. Both checked in a real browser (header, /cart/, /checkout/ update without reload after every cart tool). Not tested yet: caching plugins.

## Showing cart writes (`refreshCart` in `tools.js`)

- Classic: `wc_fragment_refresh` (mini cart), `update_checkout` (checkout order review), and on the shortcode cart page the `.woocommerce` block is re-fetched and swapped (`wc_fragment_refresh` does not touch the cart table; WooCommerce's own Update button does the same fetch).
- Block: `wc-blocks_added_to_cart` / `wc-blocks_removed_from_cart` events on `document.body` and `wp.data.dispatch("wc/store/cart").invalidateResolutionForStore()` (each alone refreshes the Cart/Checkout blocks; on pages without them `wp.data` is absent and the events reach the lazily loaded mini cart block).
