# wordpress-plugin internals

See root `CLAUDE.md` for monorepo commands, workflow and style. Plan: `apps/docs/content/en/drafts/wordpress-plugin.md`.

## Overview

WordPress plugin `pleiades-assistant` (PHP 7.4+, GPLv2+; the bundled widget is BSD-3). Not a JS package apart from `build` and the tests of the tool logic.

- `pleiades-assistant/pleiades-assistant.php` — settings page (Settings API, `manage_options`, nonce by `settings_fields`), `wp_enqueue_scripts` (widget, tools, inline `window.PleiadesWp` config incl. the `wc_store_api` nonce), `wp_footer` prints `<pleiades-chat … customer-context>` (flat JSON facts). `PLEIADES_DEFAULT_AGENT_URL` is a **placeholder**: no hosted URL exists in the repo yet.
- `assets/tools-core.js` — pure functions on `globalThis.PleiadesWpCore` (tool list with schemas and annotations, argument to request mapping, nonce refresh, same-origin check, response shaping). Tested by `tools-core.test.ts` (`bun test`). Descriptions stay generic (any shop domain).
- `assets/tools.js` — browser wiring: fetch, `document.modelContext.registerTool`, mini cart refresh (`wc_fragment_refresh` + `wc/store/cart` invalidate), stale-nonce retry (403 -> `GET /cart` -> retry once).
- `assets/pleiades-widget.js` — copied from `packages/pleiades-widget/dist` by `bun run build` (git-ignored). `dist/pleiades-assistant.zip` is the installable plugin.

Without WooCommerce only `search_site`, `get_page`, `open_page` are registered. No checkout tool; `open_page` is same-origin only.

## Load order, navigation

- The widget installs the polyfill at mount and dispatches `pleiades:webmcp-ready` on `document`; `tools.js` registers immediately if `document.modelContext` exists, else on the event.
- `open_page` returns first, navigates 50 ms later, and sets `sessionStorage["pleiades-wp-open"]`; the reloaded page re-opens the panel, and the widget restores the thread from the stored session (`localStorage`, per agent URL + key) via `history()` on open. Only the last 10 messages survive. A tool result sent after navigation may never reach the server; keep `open_page` the turn's last step (its description says so).

## Local WordPress + WooCommerce

```
bun run --cwd apps/wordpress-plugin build      # widget must be built: bun run --cwd packages/pleiades-widget build
docker compose -f compose.wp.yml up -d
```

`compose.wp.yml` is its own compose project (`pleiades-wordpress`), apart from the main stack. `wordpress-setup` (`dev/setup.sh`, wp-cli, idempotent) installs core, WooCommerce, the sample products (clothing with variations), activates the plugin and, if `WORDPRESS_PLEIADES_KEY` (+ `WORDPRESS_PLEIADES_AGENT_URL`) are set in the root `.env`, presets the settings. Site `http://localhost:8088` (`WORDPRESS_PORT`), admin / admin. Re-run setup: `docker compose -f compose.wp.yml up wordpress-setup`. The plugin dir is mounted read-only, so rebuild assets on the host.

PHP lint (no PHP on the host): `docker run --rm -v $PWD/apps/wordpress-plugin/pleiades-assistant:/p php:8.3-cli sh -c 'for f in $(find /p -name "*.php"); do php -l $f; done'`.

Not tested yet: a block theme (the default theme in the image decides), caching plugins.
