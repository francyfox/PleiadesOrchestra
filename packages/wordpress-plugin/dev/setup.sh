#!/bin/sh
# One-shot, idempotent: WordPress core, WooCommerce with its sample products, our plugin.
set -eu
URL="http://localhost:${WORDPRESS_PORT:-8088}"
cd /var/www/html
until [ -f wp-config.php ]; do sleep 2; done
until wp db check --quiet 2>/dev/null; do sleep 2; done

wp core is-installed 2>/dev/null || wp core install --url="$URL" --title="Pleiades test shop" \
	--admin_user=admin --admin_password=admin --admin_email=admin@example.com --skip-email
wp option update home "$URL"
wp option update siteurl "$URL"
wp rewrite structure '/%postname%/' --hard

wp plugin is-installed woocommerce || wp plugin install woocommerce
# old slugs of this plugin (renamed twice): drop them so only one copy is active
for old in wp-pleiades-plugin pleiades-assistant; do
	wp plugin is-installed $old && { wp plugin deactivate $old; wp plugin delete $old; }
done
wp plugin activate woocommerce pleiades-chat
# WooCommerce's "coming soon" mode hides shop, cart, checkout and product search from visitors (and from the e2e tests).
wp option update woocommerce_coming_soon no

# The CSV sample fails to create posts through WP-CLI (its IDs point nowhere); the XML sample is the supported route.
if [ "$(wp post list --post_type=product --format=count)" = "0" ]; then
	wp plugin is-installed wordpress-importer || wp plugin install wordpress-importer
	wp plugin activate wordpress-importer
	wp import wp-content/plugins/woocommerce/sample-data/sample_products.xml --authors=skip
	# Price filters read this lookup table; the import leaves it empty (WooCommerce fills it in the background).
	wp wc tool run regenerate_product_lookup_tables --user=admin
	# The on-sale id cache was filled while the catalog was empty.
	wp transient delete wc_products_onsale
fi

# WORDPRESS_THEME=kadence or storefront (classic) or twentytwentyfive (block, default). Cart and checkout pages follow the theme kind.
THEME="${WORDPRESS_THEME:-twentytwentyfive}"
wp theme is-installed "$THEME" || wp theme install "$THEME"
wp theme activate "$THEME"
CART_ID="$(wp option get woocommerce_cart_page_id)"
# Not "has theme.json": Kadence is a classic theme that ships one.
if [ "$(wp eval 'echo wp_is_block_theme() ? 1 : 0;')" = "1" ]; then
	# Block theme: pages need the Cart/Checkout blocks; recreate WooCommerce's own if we swapped them for shortcodes.
	if wp post get "$CART_ID" --field=post_content | grep -q woocommerce_cart; then
		wp post delete "$CART_ID" "$(wp option get woocommerce_checkout_page_id)" --force
		wp option delete woocommerce_cart_page_id woocommerce_checkout_page_id
		wp eval 'WC_Install::create_pages();'
	fi
else
	wp post update "$CART_ID" --post_content='[woocommerce_cart]'
	wp post update "$(wp option get woocommerce_checkout_page_id)" --post_content='[woocommerce_checkout]'
fi

if [ "$THEME" = "kadence" ]; then
	# Shop-style front page and menu (Starter Templates import needs the browser; plain blocks and shortcodes are scriptable).
	HOME_ID="$(wp post list --post_type=page --name=home --field=ID)"
	if [ -z "$HOME_ID" ]; then
		HOME_ID="$(wp post create --post_type=page --post_status=publish --post_title=Home --post_name=home --porcelain --post_content='<!-- wp:cover {"customOverlayColor":"#1f2a44","minHeight":420,"align":"full"} -->
<div class="wp-block-cover alignfull" style="min-height:420px"><span aria-hidden="true" class="wp-block-cover__background has-background-dim-100 has-background-dim" style="background-color:#1f2a44"></span><div class="wp-block-cover__inner-container"><!-- wp:heading {"textAlign":"center","level":1,"textColor":"white"} -->
<h1 class="wp-block-heading has-text-align-center has-white-color has-text-color">Everything you need, delivered</h1>
<!-- /wp:heading -->
<!-- wp:paragraph {"align":"center","textColor":"white"} -->
<p class="has-text-align-center has-white-color has-text-color">Fresh picks, new arrivals and weekly deals.</p>
<!-- /wp:paragraph -->
<!-- wp:buttons {"layout":{"type":"flex","justifyContent":"center"}} -->
<div class="wp-block-buttons"><!-- wp:button -->
<div class="wp-block-button"><a class="wp-block-button__link wp-element-button" href="/shop/">Shop now</a></div>
<!-- /wp:button --></div>
<!-- /wp:buttons --></div></div>
<!-- /wp:cover -->
<!-- wp:heading -->
<h2 class="wp-block-heading">Shop by category</h2>
<!-- /wp:heading -->
<!-- wp:shortcode -->
[product_categories number="8" parent="0" columns="4"]
<!-- /wp:shortcode -->
<!-- wp:heading -->
<h2 class="wp-block-heading">On sale</h2>
<!-- /wp:heading -->
<!-- wp:shortcode -->
[products on_sale="true" limit="4" columns="4"]
<!-- /wp:shortcode -->
<!-- wp:heading -->
<h2 class="wp-block-heading">Best sellers</h2>
<!-- /wp:heading -->
<!-- wp:shortcode -->
[products best_selling="true" limit="8" columns="4"]
<!-- /wp:shortcode -->')"
	fi
	wp post meta update "$HOME_ID" _kad_post_title hide
	wp post meta update "$HOME_ID" _kad_post_layout fullwidth
	wp option update show_on_front page
	wp option update page_on_front "$HOME_ID"
	wp eval '$h = json_decode( file_get_contents( "php://stdin" ), true ); set_theme_mod( "header_desktop_items", $h );' <<'JSON'
{"top":{"top_left":[],"top_left_center":[],"top_center":[],"top_right_center":[],"top_right":[]},"main":{"main_left":["logo"],"main_left_center":[],"main_center":[],"main_right_center":[],"main_right":["navigation","search","cart"]},"bottom":{"bottom_left":[],"bottom_left_center":[],"bottom_center":[],"bottom_right_center":[],"bottom_right":[]}}
JSON
	# Rebuilt each run so new categories show up.
	wp menu delete "Primary" 2>/dev/null || true
	wp menu create "Primary"
	wp menu item add-post Primary "$HOME_ID" --title=Home
	wp menu item add-post Primary "$(wp option get woocommerce_shop_page_id)" --title=Shop
	for T in $(wp term list product_cat --parent=0 --hide_empty=1 --orderby=count --order=DESC --number=6 --exclude="$(wp option get default_product_cat)" --field=term_id); do wp menu item add-term Primary product_cat "$T"; done
	wp menu item add-post Primary "$CART_ID" --title=Cart
	wp menu item add-post Primary "$(wp option get woocommerce_myaccount_page_id)" --title="My account"
	wp menu location assign Primary primary
fi

if [ -n "${PLEIADES_KEY:-}" ]; then
	wp option update pleiades_assistant "{\"key\":\"$PLEIADES_KEY\",\"agent_url\":\"${PLEIADES_AGENT_URL:-http://localhost:3000}\",\"position\":\"bottom-right\",\"greeting\":\"\",\"heading\":\"\"}" --format=json
fi
echo "WordPress ready: $URL (admin / admin)"
