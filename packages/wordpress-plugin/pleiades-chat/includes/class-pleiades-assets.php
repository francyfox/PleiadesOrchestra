<?php
/**
 * Script registration and the `window.PleiadesWp` config.
 *
 * @package Pleiades_Chat
 * @since   0.4.0
 */

defined( 'ABSPATH' ) || exit;

/**
 * Registers the scripts and hands them their config.
 *
 * @since 0.4.0
 */
final class Pleiades_Assets {

	/**
	 * Script handle of the widget bundle.
	 *
	 * @since 0.4.0
	 * @var string
	 */
	const HANDLE_WIDGET = 'pleiades-widget';
	/**
	 * Script handle of the pure tool logic; carries the inline config.
	 *
	 * @since 0.4.0
	 * @var string
	 */
	const HANDLE_CORE = 'pleiades-wp-core';
	/**
	 * Script handle of the browser wiring of the tools.
	 *
	 * @since 0.4.0
	 * @var string
	 */
	const HANDLE_TOOLS = 'pleiades-wp-tools';
	/**
	 * Script folder inside the plugin.
	 *
	 * @since 0.4.0
	 * @var string
	 */
	const SCRIPT_DIR = 'assets/js/';
	/**
	 * Decimals of prices when WooCommerce is not there to say.
	 *
	 * @since 0.4.0
	 * @var int
	 */
	const DEFAULT_MINOR_UNIT = 2;

	/**
	 * Enqueues the widget, core and tools scripts and prints the config before the core script.
	 *
	 * Hooked to `wp_enqueue_scripts`. Without a widget key only recipe and kit pages get the scripts
	 * (core + tools, no widget, `tools` = false), because they need the "add all" button.
	 * Config keys: woo, tools, wpUrl, storeUrl, nonce (Store API), minorUnit, and with WooCommerce
	 * also recipes, kits, pages and (on a product page) product.
	 *
	 * @since 0.4.0
	 *
	 * @return void
	 */
	public static function enqueue() {
		$has_key = '' !== Pleiades_Options::get()['key'];
		if ( ! $has_key && ! Pleiades_Recipes::is_bundle_page() ) {
			return;
		}
		self::enqueue_scripts( $has_key );
		wp_add_inline_script( self::HANDLE_CORE, 'window.PleiadesWp=' . wp_json_encode( self::config( $has_key ) ) . ';', 'before' );
	}

	/**
	 * Enqueues the scripts in load order: widget (with a key), core, then tools.
	 *
	 * @since 0.4.0
	 *
	 * @param bool $has_key Whether a widget key is saved.
	 * @return void
	 */
	private static function enqueue_scripts( $has_key ) {
		$url        = plugin_dir_url( PLEIADES_FILE ) . self::SCRIPT_DIR;
		$version    = self::asset_version();
		$tools_deps = array( self::HANDLE_CORE );
		if ( $has_key ) {
			wp_enqueue_script( self::HANDLE_WIDGET, $url . 'pleiades-widget.js', array(), $version, true );
			$tools_deps[] = self::HANDLE_WIDGET;
		}
		wp_enqueue_script( self::HANDLE_CORE, $url . 'tools-core.js', array(), $version, true );
		wp_enqueue_script( self::HANDLE_TOOLS, $url . 'tools.js', $tools_deps, $version, true );
	}

	/**
	 * Cache-busting string: the plugin version plus the file times, so a changed asset reloads without a version bump.
	 *
	 * @since 0.4.0
	 *
	 * @return string Version string.
	 */
	private static function asset_version() {
		$dir = plugin_dir_path( PLEIADES_FILE ) . self::SCRIPT_DIR;
		return PLEIADES_VERSION . '.' . filemtime( $dir . 'tools.js' ) . filemtime( $dir . 'pleiades-widget.js' );
	}

	/**
	 * The `window.PleiadesWp` config.
	 *
	 * @since 0.4.0
	 *
	 * @param bool $has_key Whether a widget key is saved (`tools` is true only then).
	 * @return array Config, JSON-encoded by the caller.
	 */
	private static function config( $has_key ) {
		$config = self::base_config( $has_key );
		if ( Pleiades_Context::has_woo() ) {
			$config += self::shop_config();
		}
		$facts = Pleiades_Context::facts();
		if ( isset( $facts['product_id'] ) ) {
			$config['product'] = self::product_config( $facts );
		}
		return $config;
	}

	/**
	 * Config every page gets.
	 *
	 * @since 0.4.0
	 *
	 * @param bool $has_key Whether a widget key is saved.
	 * @return array Config.
	 */
	private static function base_config( $has_key ) {
		$has_woo = Pleiades_Context::has_woo();
		return array(
			'woo'       => $has_woo,
			'tools'     => $has_key,
			'wpUrl'     => rest_url( 'wp/v2/' ),
			'storeUrl'  => rest_url( 'wc/store/v1/' ),
			'nonce'     => $has_woo ? wp_create_nonce( 'wc_store_api' ) : '',
			'minorUnit' => $has_woo ? wc_get_price_decimals() : self::DEFAULT_MINOR_UNIT,
		);
	}

	/**
	 * Config that needs WooCommerce: recipes, kits and the shop page URLs.
	 *
	 * @since 0.4.0
	 *
	 * @return array Config.
	 */
	private static function shop_config() {
		return array(
			'recipes' => Pleiades_Recipes::bundles( Pleiades_Recipes::RECIPE ),
			'kits'    => Pleiades_Recipes::bundles( Pleiades_Recipes::KIT_TYPE ),
			'pages'   => array(
				'cart'     => wc_get_cart_url(),
				'checkout' => wc_get_checkout_url(),
				'account'  => wc_get_page_permalink( 'myaccount' ),
			),
		);
	}

	/**
	 * The product being viewed, as the tools see it.
	 *
	 * @since 0.4.0
	 *
	 * @param array $facts Page facts of a product page, from Pleiades_Context::facts().
	 * @return array{id: int, name: string, price: string, currency: string, url: string} Product.
	 */
	private static function product_config( $facts ) {
		return array(
			'id'       => $facts['product_id'],
			'name'     => $facts['product_name'],
			'price'    => $facts['product_price'],
			'currency' => $facts['currency'],
			'url'      => get_permalink( $facts['product_id'] ),
		);
	}
}
