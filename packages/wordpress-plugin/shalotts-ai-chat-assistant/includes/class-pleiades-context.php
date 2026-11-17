<?php
/**
 * Page facts and the <pleiades-chat> element.
 *
 * @package Pleiades_Chat
 * @since   0.4.0
 */

defined( 'ABSPATH' ) || exit;

/**
 * What the page tells the widget: facts about the page and the <pleiades-chat> element.
 *
 * @since 0.4.0
 */
final class Pleiades_Context {

	/**
	 * `page_type` fact: a single product.
	 *
	 * @since 0.4.0
	 * @var string
	 */
	const PAGE_PRODUCT = 'product';
	/**
	 * `page_type` fact: a product category archive.
	 *
	 * @since 0.4.0
	 * @var string
	 */
	const PAGE_CATEGORY = 'category';
	/**
	 * `page_type` fact: the cart page.
	 *
	 * @since 0.4.0
	 * @var string
	 */
	const PAGE_CART = 'cart';
	/**
	 * `page_type` fact: the checkout page.
	 *
	 * @since 0.4.0
	 * @var string
	 */
	const PAGE_CHECKOUT = 'checkout';
	/**
	 * `page_type` fact: a blog post.
	 *
	 * @since 0.4.0
	 * @var string
	 */
	const PAGE_POST = 'post';
	/**
	 * `page_type` fact: any other page.
	 *
	 * @since 0.4.0
	 * @var string
	 */
	const PAGE_PAGE = 'page';

	/**
	 * Whether WooCommerce is loaded.
	 *
	 * @since 0.4.0
	 *
	 * @return bool
	 */
	public static function has_woo() {
		return class_exists( 'WooCommerce' );
	}

	/**
	 * Flat facts about the page, sent with every message as customer:* facts.
	 *
	 * Always has `locale` and `page_type` (product, category, cart, checkout, post or page).
	 * A product page adds product_id, product_name, product_price, currency; a category page adds
	 * `category`. `cart_count` is only a hint: a cached page may show someone else's count.
	 *
	 * @since 0.4.0
	 *
	 * @return array<string, string|int> Fact name => value.
	 */
	public static function facts() {
		$facts = array( 'locale' => get_locale() ) + self::page_facts();
		// A cached page shows the count of whoever it was cached for: the get_cart tool is the source of truth.
		if ( self::has_cart() ) {
			$facts['cart_count'] = WC()->cart->get_cart_contents_count();
		}
		return $facts;
	}

	/**
	 * The page type and what goes with it, for the page being viewed.
	 *
	 * @since 0.4.0
	 *
	 * @return array<string, string|int> Fact name => value.
	 */
	private static function page_facts() {
		if ( ! self::has_woo() ) {
			return self::content_page_facts();
		}
		switch ( true ) {
			case is_product():
				return self::product_facts();
			case is_product_category():
				return array(
					'page_type' => self::PAGE_CATEGORY,
					'category'  => single_term_title( '', false ),
				);
			case is_cart():
				return array( 'page_type' => self::PAGE_CART );
			case is_checkout():
				return array( 'page_type' => self::PAGE_CHECKOUT );
			default:
				return self::content_page_facts();
		}
	}

	/**
	 * Facts of a blog post or an ordinary page.
	 *
	 * @since 0.4.0
	 *
	 * @return array<string, string> Fact name => value.
	 */
	private static function content_page_facts() {
		return array( 'page_type' => is_singular( 'post' ) ? self::PAGE_POST : self::PAGE_PAGE );
	}

	/**
	 * Facts of the product being viewed.
	 *
	 * @since 0.4.0
	 *
	 * @return array<string, string|int> Fact name => value; empty when the product cannot be loaded.
	 */
	private static function product_facts() {
		$product = wc_get_product( get_queried_object_id() );
		if ( ! $product ) {
			return array();
		}
		return array(
			'page_type'     => self::PAGE_PRODUCT,
			'product_id'    => $product->get_id(),
			'product_name'  => $product->get_name(),
			'product_price' => (string) $product->get_price(),
			'currency'      => get_woocommerce_currency(),
		);
	}

	/**
	 * Whether the visitor has a WooCommerce cart object to count.
	 *
	 * @since 0.4.0
	 *
	 * @return bool
	 */
	private static function has_cart() {
		return self::has_woo() && function_exists( 'WC' ) && WC()->cart;
	}

	/**
	 * Prints the <pleiades-chat> element in the footer; prints nothing without a key.
	 *
	 * Hooked to `wp_footer`. When a language is chosen, the Localization tab's texts are merged over the
	 * General tab's heading and greeting. Every value goes through esc_attr().
	 *
	 * @since 0.4.0
	 *
	 * @return void
	 */
	public static function print_widget() {
		$settings = Pleiades_Options::get();
		if ( '' === $settings['key'] ) {
			return;
		}
		echo '<pleiades-chat' . self::html_attributes( self::widget_attributes( $settings ) ) . '></pleiades-chat>'; // phpcs:ignore WordPress.Security.EscapeOutput -- every value is esc_attr'd by html_attributes().
	}

	/**
	 * Attributes of the <pleiades-chat> element; the chosen language's texts win over the legacy heading and greeting.
	 *
	 * @since 0.4.0
	 *
	 * @param array $settings Settings as returned by Pleiades_Options::get().
	 * @return array<string, string> Attribute name => raw value.
	 */
	private static function widget_attributes( $settings ) {
		$attributes = array(
			'agent-url'        => $settings['agent_url'],
			'publishable-key'  => $settings['key'],
			'position'         => $settings['position'],
			'heading'          => $settings['heading'],
			'greeting'         => $settings['greeting'],
			'customer-context' => wp_json_encode( self::facts() ),
		);
		if ( Pleiades_Options::LANG_AUTOMATIC === $settings['lang'] ) {
			return $attributes;
		}
		$attributes['lang'] = $settings['lang'];
		return array_merge( $attributes, Pleiades_Options::widget_overrides( $settings ) );
	}

	/**
	 * HTML attribute string, one leading space per attribute.
	 *
	 * @since 0.4.0
	 *
	 * @param array<string, string> $attributes Attribute name => raw value.
	 * @return string E.g. ` position="top-left" lang="ru"`, values escaped.
	 */
	private static function html_attributes( $attributes ) {
		$html = '';
		foreach ( $attributes as $name => $value ) {
			$html .= sprintf( ' %s="%s"', $name, esc_attr( $value ) );
		}
		return $html;
	}
}
