<?php
/**
 * Plugin Name: Pleiades Assistant
 * Description: An AI shop and site assistant (Pleiades chat widget) with WooCommerce tools for search, product cards and the cart.
 * Version: 0.1.0
 * Requires at least: 6.4
 * Requires PHP: 7.4
 * Author: Danil Golota
 * License: GPL-2.0-or-later
 * License URI: https://www.gnu.org/licenses/gpl-2.0.html
 * Text Domain: pleiades-assistant
 */

defined( 'ABSPATH' ) || exit;

// Placeholder: the hosted orchestrator is not published yet. Replace before release.
const PLEIADES_DEFAULT_AGENT_URL = 'https://agent.pleiades.shalotts.site';
const PLEIADES_OPTION            = 'pleiades_assistant';
const PLEIADES_POSITIONS         = array( 'bottom-left', 'bottom-right', 'top-left', 'top-right' );

function pleiades_settings() {
	return wp_parse_args(
		get_option( PLEIADES_OPTION, array() ),
		array(
			'key'       => '',
			'agent_url' => PLEIADES_DEFAULT_AGENT_URL,
			'position'  => 'bottom-right',
			'greeting'  => '',
			'heading'   => '',
		)
	);
}

/* ---- Settings page (Settings API: nonce and option write are handled by options.php) ---- */

add_action(
	'admin_menu',
	function () {
		add_options_page( 'Pleiades Assistant', 'Pleiades Assistant', 'manage_options', 'pleiades-assistant', 'pleiades_settings_page' );
	}
);

add_action(
	'admin_init',
	function () {
		register_setting(
			'pleiades_assistant',
			PLEIADES_OPTION,
			array(
				'type'              => 'array',
				'sanitize_callback' => 'pleiades_sanitize',
				'default'           => array(),
			)
		);
	}
);

function pleiades_sanitize( $in ) {
	$in  = is_array( $in ) ? $in : array();
	$key = isset( $in['key'] ) ? trim( sanitize_text_field( $in['key'] ) ) : '';
	if ( '' !== $key && ! preg_match( '/^pk_[A-Za-z0-9_-]+$/', $key ) ) {
		add_settings_error( PLEIADES_OPTION, 'bad_key', 'The key must be a publishable key (starts with pk_). Never paste a secret key.' );
		$key = '';
	}
	$url      = isset( $in['agent_url'] ) ? esc_url_raw( trim( $in['agent_url'] ), array( 'http', 'https' ) ) : '';
	$position = isset( $in['position'] ) ? sanitize_key( $in['position'] ) : '';
	return array(
		'key'       => $key,
		'agent_url' => '' !== $url ? untrailingslashit( $url ) : PLEIADES_DEFAULT_AGENT_URL,
		'position'  => in_array( $position, PLEIADES_POSITIONS, true ) ? $position : 'bottom-right',
		'greeting'  => isset( $in['greeting'] ) ? sanitize_text_field( $in['greeting'] ) : '',
		'heading'   => isset( $in['heading'] ) ? sanitize_text_field( $in['heading'] ) : '',
	);
}

function pleiades_settings_page() {
	if ( ! current_user_can( 'manage_options' ) ) {
		return;
	}
	$s = pleiades_settings();
	?>
	<div class="wrap">
		<h1>Pleiades Assistant</h1>
		<p>Messages go to the agent URL below and to the language model providers it uses. Mention it in your privacy policy.</p>
		<form method="post" action="options.php">
			<?php settings_fields( 'pleiades_assistant' ); ?>
			<table class="form-table" role="presentation">
				<tr><th><label for="pl-key">Publishable key</label></th>
					<td><input id="pl-key" class="regular-text" name="<?php echo esc_attr( PLEIADES_OPTION ); ?>[key]" value="<?php echo esc_attr( $s['key'] ); ?>" placeholder="pk_…" autocomplete="off">
					<p class="description">From your channel in the Pleiades admin panel. The channel must allow <code><?php echo esc_html( home_url() ); ?></code>.</p></td></tr>
				<tr><th><label for="pl-url">Agent URL</label></th>
					<td><input id="pl-url" class="regular-text" type="url" name="<?php echo esc_attr( PLEIADES_OPTION ); ?>[agent_url]" value="<?php echo esc_attr( $s['agent_url'] ); ?>"></td></tr>
				<tr><th><label for="pl-pos">Position</label></th>
					<td><select id="pl-pos" name="<?php echo esc_attr( PLEIADES_OPTION ); ?>[position]">
						<?php foreach ( PLEIADES_POSITIONS as $p ) : ?>
							<option value="<?php echo esc_attr( $p ); ?>" <?php selected( $s['position'], $p ); ?>><?php echo esc_html( $p ); ?></option>
						<?php endforeach; ?>
					</select></td></tr>
				<tr><th><label for="pl-head">Heading</label></th>
					<td><input id="pl-head" class="regular-text" name="<?php echo esc_attr( PLEIADES_OPTION ); ?>[heading]" value="<?php echo esc_attr( $s['heading'] ); ?>"></td></tr>
				<tr><th><label for="pl-greet">Greeting</label></th>
					<td><input id="pl-greet" class="regular-text" name="<?php echo esc_attr( PLEIADES_OPTION ); ?>[greeting]" value="<?php echo esc_attr( $s['greeting'] ); ?>"></td></tr>
			</table>
			<?php submit_button(); ?>
		</form>
	</div>
	<?php
}

/* ---- Front end ---- */

function pleiades_has_woo() {
	return class_exists( 'WooCommerce' );
}

/** Flat facts about the page, sent with every message as customer:* facts. */
function pleiades_context() {
	$ctx = array( 'locale' => get_locale() );
	if ( pleiades_has_woo() && is_product() ) {
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
	} elseif ( pleiades_has_woo() && is_product_category() ) {
		$ctx += array(
			'page_type' => 'category',
			'category'  => single_term_title( '', false ),
		);
	} elseif ( pleiades_has_woo() && is_cart() ) {
		$ctx['page_type'] = 'cart';
	} elseif ( pleiades_has_woo() && is_checkout() ) {
		$ctx['page_type'] = 'checkout';
	} else {
		$ctx['page_type'] = is_singular( 'post' ) ? 'post' : 'page';
	}
	// A cached page shows the count of whoever it was cached for: the get_cart tool is the source of truth.
	if ( pleiades_has_woo() && function_exists( 'WC' ) && WC()->cart ) {
		$ctx['cart_count'] = WC()->cart->get_cart_contents_count();
	}
	return $ctx;
}

add_action(
	'wp_enqueue_scripts',
	function () {
		if ( '' === pleiades_settings()['key'] ) {
			return;
		}
		$url = plugin_dir_url( __FILE__ ) . 'assets/';
		// The file times bust browser caches when an asset changes without a version bump.
		$ver = '0.1.0.' . filemtime( __DIR__ . '/assets/tools.js' ) . filemtime( __DIR__ . '/assets/pleiades-widget.js' );
		wp_register_script( 'pleiades-widget', $url . 'pleiades-widget.js', array(), $ver, true );
		wp_enqueue_script( 'pleiades-widget' );
		wp_enqueue_script( 'pleiades-wp-core', $url . 'tools-core.js', array(), $ver, true );
		wp_enqueue_script( 'pleiades-wp-tools', $url . 'tools.js', array( 'pleiades-wp-core', 'pleiades-widget' ), $ver, true );

		$woo = pleiades_has_woo();
		$cfg = array(
			'woo'       => $woo,
			'wpUrl'     => rest_url( 'wp/v2/' ),
			'storeUrl'  => rest_url( 'wc/store/v1/' ),
			'nonce'     => $woo ? wp_create_nonce( 'wc_store_api' ) : '',
			'minorUnit' => $woo ? wc_get_price_decimals() : 2,
		);
		$ctx = pleiades_context();
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
);

add_action(
	'wp_footer',
	function () {
		$s = pleiades_settings();
		if ( '' === $s['key'] ) {
			return;
		}
		printf(
			'<pleiades-chat agent-url="%s" publishable-key="%s" position="%s" heading="%s" greeting="%s" customer-context="%s"></pleiades-chat>',
			esc_attr( $s['agent_url'] ),
			esc_attr( $s['key'] ),
			esc_attr( $s['position'] ),
			esc_attr( $s['heading'] ),
			esc_attr( $s['greeting'] ),
			esc_attr( wp_json_encode( pleiades_context() ) )
		);
	}
);

add_filter(
	'plugin_action_links_' . plugin_basename( __FILE__ ),
	function ( $links ) {
		array_unshift( $links, '<a href="' . esc_url( admin_url( 'options-general.php?page=pleiades-assistant' ) ) . '">Settings</a>' );
		return $links;
	}
);
