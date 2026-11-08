<?php
defined( 'ABSPATH' ) || exit;

/** Registers the scripts and hands them their config (no JS lives in PHP: only `window.PleiadesWp = {...}`). */
final class Pleiades_Assets {

	public static function enqueue() {
		$has_key = '' !== Pleiades_Options::get()['key'];
		// Without a key only the "add all" buttons of recipe and kit pages need the scripts.
		if ( ! $has_key && ! Pleiades_Recipes::is_bundle_page() ) {
			return;
		}
		$dir = plugin_dir_path( PLEIADES_FILE ) . 'assets/js/';
		$url = plugin_dir_url( PLEIADES_FILE ) . 'assets/js/';
		// The file times bust browser caches when an asset changes without a version bump.
		$ver  = PLEIADES_VERSION . '.' . filemtime( $dir . 'tools.js' ) . filemtime( $dir . 'pleiades-widget.js' );
		$deps = array( 'pleiades-wp-core' );
		if ( $has_key ) {
			wp_enqueue_script( 'pleiades-widget', $url . 'pleiades-widget.js', array(), $ver, true );
			$deps[] = 'pleiades-widget';
		}
		wp_enqueue_script( 'pleiades-wp-core', $url . 'tools-core.js', array(), $ver, true );
		wp_enqueue_script( 'pleiades-wp-tools', $url . 'tools.js', $deps, $ver, true );

		$woo = Pleiades_Context::has_woo();
		$cfg = array(
			'woo'       => $woo,
			'tools'     => $has_key,
			'wpUrl'     => rest_url( 'wp/v2/' ),
			'storeUrl'  => rest_url( 'wc/store/v1/' ),
			'nonce'     => $woo ? wp_create_nonce( 'wc_store_api' ) : '',
			'minorUnit' => $woo ? wc_get_price_decimals() : 2,
		);
		if ( $woo ) {
			// The tool schemas are built from these at registration time.
			$cfg['recipes'] = Pleiades_Recipes::bundles( 'pleiades_recipe' );
			$cfg['kits']    = Pleiades_Recipes::bundles( 'product' );
			// So open_page knows where the cart, checkout and account are.
			$cfg['pages'] = array(
				'cart'     => wc_get_cart_url(),
				'checkout' => wc_get_checkout_url(),
				'account'  => wc_get_page_permalink( 'myaccount' ),
			);
		}
		$ctx = Pleiades_Context::facts();
		if ( isset( $ctx['product_id'] ) ) {
			$cfg['product'] = array(
				'id'       => $ctx['product_id'],
				'name'     => $ctx['product_name'],
				'price'    => $ctx['product_price'],
				'currency' => $ctx['currency'],
				'url'      => get_permalink( $ctx['product_id'] ),
			);
		}
		wp_add_inline_script( 'pleiades-wp-core', 'window.PleiadesWp=' . wp_json_encode( $cfg ) . ';', 'before' );
	}
}
