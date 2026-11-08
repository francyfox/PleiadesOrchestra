<?php
defined( 'ABSPATH' ) || exit;

/** What the page tells the widget: facts about the page and the <pleiades-chat> element. */
final class Pleiades_Context {

	public static function has_woo() {
		return class_exists( 'WooCommerce' );
	}

	/** Flat facts about the page, sent with every message as customer:* facts. */
	public static function facts() {
		$woo = self::has_woo();
		$ctx = array( 'locale' => get_locale() );
		if ( $woo && is_product() ) {
			$p = wc_get_product( get_queried_object_id() );
			if ( $p ) {
				$ctx += array(
					'page_type'     => 'product',
					'product_id'    => $p->get_id(),
					'product_name'  => $p->get_name(),
					'product_price' => (string) $p->get_price(),
					'currency'      => get_woocommerce_currency(),
				);
			}
		} elseif ( $woo && is_product_category() ) {
			$ctx += array(
				'page_type' => 'category',
				'category'  => single_term_title( '', false ),
			);
		} elseif ( $woo && is_cart() ) {
			$ctx['page_type'] = 'cart';
		} elseif ( $woo && is_checkout() ) {
			$ctx['page_type'] = 'checkout';
		} else {
			$ctx['page_type'] = is_singular( 'post' ) ? 'post' : 'page';
		}
		// A cached page shows the count of whoever it was cached for: the get_cart tool is the source of truth.
		if ( $woo && function_exists( 'WC' ) && WC()->cart ) {
			$ctx['cart_count'] = WC()->cart->get_cart_contents_count();
		}
		return $ctx;
	}

	public static function print_widget() {
		$s = Pleiades_Options::get();
		if ( '' === $s['key'] ) {
			return;
		}
		$attrs = array(
			'agent-url'        => $s['agent_url'],
			'publishable-key'  => $s['key'],
			'position'         => $s['position'],
			'heading'          => $s['heading'],
			'greeting'         => $s['greeting'],
			'customer-context' => wp_json_encode( self::facts() ),
		);
		if ( '' !== $s['lang'] ) {
			$attrs['lang'] = $s['lang'];
			// The Localization tab wins over the General tab's heading and greeting; empty keeps the widget default.
			$attrs = array_merge( $attrs, Pleiades_Options::widget_overrides( $s ) );
		}
		$html = '';
		foreach ( $attrs as $name => $value ) {
			$html .= sprintf( ' %s="%s"', $name, esc_attr( $value ) );
		}
		echo '<pleiades-chat' . $html . '></pleiades-chat>'; // phpcs:ignore WordPress.Security.EscapeOutput -- every value is esc_attr'd above.
	}
}
