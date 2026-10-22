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
wp plugin activate woocommerce pleiades-assistant

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

# WORDPRESS_THEME=storefront (classic) or twentytwentyfive (block, default). Cart and checkout pages follow the theme kind.
THEME="${WORDPRESS_THEME:-twentytwentyfive}"
wp theme is-installed "$THEME" || wp theme install "$THEME"
wp theme activate "$THEME"
CART_ID="$(wp option get woocommerce_cart_page_id)"
if [ -f "wp-content/themes/$THEME/theme.json" ]; then
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

if [ -n "${PLEIADES_KEY:-}" ]; then
	wp option update pleiades_assistant "{\"key\":\"$PLEIADES_KEY\",\"agent_url\":\"${PLEIADES_AGENT_URL:-http://localhost:3000}\",\"position\":\"bottom-right\",\"greeting\":\"\",\"heading\":\"\"}" --format=json
fi
echo "WordPress ready: $URL (admin / admin)"
