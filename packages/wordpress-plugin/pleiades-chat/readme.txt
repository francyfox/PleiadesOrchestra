=== Pleiades Chat ===
Plugin URI: https://pleiades.shalotts.site/
Contributors: francyfox
Tags: chatbot, assistant, woocommerce, ai, chat
Requires at least: 6.4
Tested up to: 7.1
Requires PHP: 7.4
Stable tag: 0.6.0
License: GPLv2 or later
License URI: https://www.gnu.org/licenses/gpl-2.0.html

An AI assistant for your site and your WooCommerce shop: it searches products, answers from your pages and fills the cart.

== Description ==

Paste the publishable key of your Pleiades channel and the chat widget appears on every page. With WooCommerce active the assistant can search products, read product cards (including variations), and add items to the visitor's own cart. It never places an order: it can only open the checkout page.

Without WooCommerce it answers from your pages and posts.

= Requirements =
The plugin is a client: the assistant itself runs in the Pleiades agent service, so you need one of these:

* **Your own server (self-hosted).** Run the open-source Pleiades stack yourself and set its address as the "Agent URL" in Settings. Nothing is paid to us. You pay for your own hosting and models. Instructions: https://github.com/francyfox/PleiadesOrchestra
* **The hosted cloud service.** A paid service run by the plugin's author, used by default (https://albedo.shalotts.site). Prices: https://pleiades.shalotts.site/#prices (terms: https://pleiades.shalotts.site/terms/)

= Links =
Website: https://pleiades.shalotts.site/
Panel: https://pleiades-panel.shalotts.site/user/login

= Source code =
The bundled `assets/js/pleiades-widget.js` is minified. Its human-readable source is in the project repository: https://github.com/francyfox/PleiadesOrchestra/tree/master/packages/pleiades-widget

To rebuild it: clone the repository, run `bun install` in the root, then `bun run build` in `packages/pleiades-widget` (writes `dist/pleiades-widget.js`), then `bun run build` in `packages/wordpress-plugin`, which copies the widget into `assets/js/` and zips this plugin. The other scripts (`tools-core.js`, `tools.js`) are shipped unminified.

The chat widget is BSD-3-Clause, the rest of the plugin GPLv2 or later. No scripts are loaded from a CDN.

== External services ==

This plugin connects to the **Pleiades agent service**, a hosted service that runs the assistant (it uses language models to answer). Without a publishable key nothing is sent anywhere.

* Service: https://albedo.shalotts.site (the default "Agent URL" in Settings. You can point it to your own Pleiades server).
* Key: the publishable key (pk_...) is issued in the Pleiades panel, https://pleiades-panel.shalotts.site/user/login . The panel is used by you, the site owner. The plugin itself never contacts it.
* When: only after a visitor opens the chat panel (also when the panel stays open across a page load). Nothing is sent while the panel is closed. The tool list is sent once when the panel opens and again if the site's tools change while it is open.
* Data sent: the widget key (as a header, to identify your channel). Every chat message the visitor types and the earlier messages of the same conversation. The page path and query string the visitor is on. The visitor's language, local date and time zone. The "customer context" printed by the plugin: site locale, page type (product, category, cart, checkout, post or page), and on a WooCommerce shop the product ID, name, price and currency of the viewed product, the category name and the number of items in the cart. The tool list of your site (names, descriptions and parameter schemas of the assistant tools, plus the names of your recipes and kits, the cart/checkout/account page addresses). The results of the tools the assistant runs in the visitor's browser (for example product data from your public store API, the visitor's cart contents, page text), which are returned to the service so it can answer. The plugin never sends the visitor's name, email or payment data, and the assistant can't place orders.
* The service passes message text to language model providers it uses to produce the answer.
* Stored in the visitor's browser (no cookies are set by the chat. The plugin never reads or writes WooCommerce or WordPress cookies itself):
  * `localStorage`, one entry named `pleiades-widget:<agent URL>:<widget key>`: an anonymous visitor token, its expiry time (24 hours after it is issued) and the conversation ID, so the conversation survives page loads. An expired token is ignored and a new one is requested.
  * `localStorage`, a second entry with the same name plus `:lang`: the language the visitor picked in the chat, kept until the visitor changes it or clears site data.
  * `sessionStorage`, key `pleiades-wp-open`: a one-time flag set when the assistant opens a page for the visitor, so the chat panel opens again after the page reloads. It is removed right after use and disappears when the tab is closed.
  * If the browser blocks storage, the chat keeps this data in memory for the current page only.
* Cart, product and page data returned by the tools is used to answer the current message and is not stored by the plugin. The visitor can clear the browser entries above at any time by clearing the site's data.

Terms of service: https://pleiades.shalotts.site/terms/
Privacy policy: https://pleiades.shalotts.site/privacy/

Please mention this service in your own site's privacy policy.

== Installation ==

1. Upload the plugin and activate it.
2. Get a publishable key (pk_...) in the panel: https://pleiades-panel.shalotts.site/user/login
3. Settings > Pleiades Chat: paste the key.
4. Settings > Pleiades Chat > Localization: pick a language and override the widget texts (optional).
5. The channel must allow your site's address.

== Screenshots ==

1. The chat panel opens on any page of the site, with a greeting and example questions.
2. The assistant finds products and answers in the chat while the site shows the results.
3. The assistant adds an item to the visitor's own cart.
4. Settings: publishable key, agent URL and widget position.
5. Localization: choose the widget language and override its texts.

== Changelog ==

= 0.6.0 =
* New assistant tools: clear the cart in one step, apply and remove a coupon, product reviews, product tags.
* A product with variations: the reply lists the options to choose from (up to four values each), and the choice is matched to the product's own spelling (size m = Size M).
* Search: the straight and the typographic apostrophe both find "Women’s", the best match comes first, and a word-by-word search no longer sends the visitor to a page of one word.
* The chat panel starts below the WordPress admin bar.
* The readme says what the plugin needs: your own server or the paid hosted service.

= 0.5.0 =
* External services disclosure with terms and privacy links. The hosted Pleiades service is the default agent URL.
* Limits on how much the assistant can add to a cart in one step (filter `pleiades_chat_limits`). Tool failures are reported as codes, not the shop's text.
* `search_products` opens the shop's results page. `update_cart_item` with quantity 0 removes the item.
* Security: password-protected recipes and kits stay hidden, recipe fields have limits, the page config is escaped harder, the recipe and kit lists are cached.
* Plugin Check reports no errors or warnings. The PHP code has PHPDoc and small named functions.

= 0.4.0 =
* Plugin renamed to pleiades-chat (deactivate the old copy), split into classes, settings tabs with Localization, open_page knows the cart, checkout and account addresses.

= 0.2.0 =
* Recipes (custom post type, "add all ingredients" button), kits (grouped products with quantities) and the matching assistant tools.

= 0.1.0 =
* First version.
