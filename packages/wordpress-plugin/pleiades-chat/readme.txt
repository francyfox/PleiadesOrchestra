=== Pleiades Assistant ===
Plugin URI: https://pleiades.shalotts.site/
Contributors: francyfox
Tags: chatbot, assistant, woocommerce, ai, chat
Requires at least: 6.4
Tested up to: 7.1
Requires PHP: 7.4
Stable tag: 0.4.0
License: GPLv2 or later
License URI: https://www.gnu.org/licenses/gpl-2.0.html

An AI assistant for your site and your WooCommerce shop: it searches products, answers from your pages and fills the cart.

== Description ==

Paste the publishable key of your Pleiades channel and the chat widget appears on every page. With WooCommerce active the assistant can search products, read product cards (including variations), and add items to the visitor's own cart. It never places an order: it can only open the checkout page.

Without WooCommerce it answers from your pages and posts.

= Links =
Website: https://pleiades.shalotts.site/
Panel: https://pleiades-panel.shalotts.site/user/login

= Source code =
The bundled `assets/js/pleiades-widget.js` is minified. Its human-readable source is in the project repository: https://github.com/francyfox/PleiadesOrchestra/tree/master/packages/pleiades-widget

To rebuild it: clone the repository, run `bun install` in the root, then `bun run build` in `packages/pleiades-widget` (writes `dist/pleiades-widget.js`), then `bun run build` in `packages/wordpress-plugin`, which copies the widget into `assets/js/` and zips this plugin. The other scripts (`tools-core.js`, `tools.js`) are shipped unminified.

The chat widget is BSD-3-Clause, the rest of the plugin GPLv2 or later. No scripts are loaded from a CDN.

== External services ==

This plugin connects to the **Pleiades agent service**, a hosted service that runs the assistant (it uses language models to answer). Without a publishable key nothing is sent anywhere.

* Service: https://albedo.shalotts.site (the default "Agent URL" in Settings; you can point it to your own Pleiades server).
* Key: the publishable key (pk_...) is issued in the Pleiades panel, https://pleiades-panel.shalotts.site/user/login . The panel is used by you, the site owner; the plugin itself never contacts it.
* When: only after a visitor opens the chat panel (also when the panel stays open across a page load). Nothing is sent while the panel is closed. The tool list is sent once when the panel opens and again if the site's tools change while it is open.
* Data sent: the widget key (as a header, to identify your channel); every chat message the visitor types and the earlier messages of the same conversation; the page path and query string the visitor is on; the visitor's language, local date and time zone; the "customer context" printed by the plugin: site locale, page type (product, category, cart, checkout, post or page), and on a WooCommerce shop the product ID, name, price and currency of the viewed product, the category name and the number of items in the cart; the tool list of your site (names, descriptions and parameter schemas of the assistant tools, plus the names of your recipes and kits, the cart/checkout/account page addresses); and the results of the tools the assistant runs in the visitor's browser (for example product data from your public store API, the visitor's cart contents, page text), which are returned to the service so it can answer. The plugin never sends the visitor's name, email or payment data, and the assistant can't place orders.
* The service passes message text to language model providers it uses to produce the answer.
* Stored in the visitor's browser: an anonymous visitor token and conversation ID (localStorage) so the conversation survives page loads.

Terms of service: https://pleiades.shalotts.site/terms/
Privacy policy: https://pleiades.shalotts.site/privacy/

Please mention this service in your own site's privacy policy.

== Installation ==

1. Upload the plugin and activate it.
2. Get a publishable key (pk_...) in the panel: https://pleiades-panel.shalotts.site/user/login
3. Settings > Pleiades Assistant: paste the key.
4. Settings > Pleiades Assistant > Localization: pick a language and override the widget texts (optional).
5. The channel must allow your site's address.

== Changelog ==

= 0.4.0 =
* Plugin renamed to pleiades-chat (deactivate the old copy), split into classes, settings tabs with Localization, open_page knows the cart, checkout and account addresses.

= 0.2.0 =
* Recipes (custom post type, "add all ingredients" button), kits (grouped products with quantities) and the matching assistant tools.

= 0.1.0 =
* First version.
