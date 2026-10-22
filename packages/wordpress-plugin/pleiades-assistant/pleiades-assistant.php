<?php
/**
 * Plugin Name: Pleiades Assistant
 * Description: An AI shop and site assistant (Pleiades chat widget) with WooCommerce tools for search, product cards and the cart.
 * Version: 0.2.0
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
		$has_key = '' !== pleiades_settings()['key'];
		// Without a key only the "add all" buttons of recipe and kit pages need the scripts.
		if ( ! $has_key && ! pleiades_bundle_page() ) {
			return;
		}
		$url = plugin_dir_url( __FILE__ ) . 'assets/';
		// The file times bust browser caches when an asset changes without a version bump.
		$ver  = '0.2.0.' . filemtime( __DIR__ . '/assets/tools.js' ) . filemtime( __DIR__ . '/assets/pleiades-widget.js' );
		$deps = array( 'pleiades-wp-core' );
		if ( $has_key ) {
			wp_enqueue_script( 'pleiades-widget', $url . 'pleiades-widget.js', array(), $ver, true );
			$deps[] = 'pleiades-widget';
		}
		wp_enqueue_script( 'pleiades-wp-core', $url . 'tools-core.js', array(), $ver, true );
		wp_enqueue_script( 'pleiades-wp-tools', $url . 'tools.js', $deps, $ver, true );

		$woo = pleiades_has_woo();
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
			$cfg['recipes'] = pleiades_bundles( 'pleiades_recipe' );
			$cfg['kits']    = pleiades_bundles( 'product' );
		}
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

/* ---- Recipes and kits: named lists of products ---- */

const PLEIADES_RECIPE = 'pleiades_recipe';

add_action( 'init', 'pleiades_register_types' );

function pleiades_register_types() {
	register_post_type(
		PLEIADES_RECIPE,
		array(
			'label'        => 'Recipes',
			'labels'       => array( 'singular_name' => 'Recipe' ),
			'description'  => 'Simple recipes: add every ingredient to the cart in one click.',
			'public'       => true,
			'has_archive'  => 'recipes',
			'rewrite'      => array( 'slug' => 'recipes' ),
			'show_in_rest' => true,
			'menu_icon'    => 'dashicons-carrot',
			'supports'     => array( 'title', 'editor', 'thumbnail', 'excerpt', 'custom-fields' ),
		)
	);
	foreach ( array( 'servings', 'time_minutes' ) as $key ) {
		register_post_meta( PLEIADES_RECIPE, $key, array( 'type' => 'integer', 'single' => true, 'show_in_rest' => true ) );
	}
	register_post_meta(
		PLEIADES_RECIPE,
		'ingredients',
		array(
			'type'         => 'array',
			'single'       => true,
			'show_in_rest' => array(
				'schema' => array(
					'type'  => 'array',
					'items' => array(
						'type'                 => 'object',
						'properties'           => array(
							'sku'      => array( 'type' => 'string' ),
							'quantity' => array( 'type' => 'integer' ),
							'note'     => array( 'type' => 'string' ),
						),
						'additionalProperties' => false,
					),
				),
			),
		)
	);
	// JSON text [{"sku": "...", "quantity": n}]: a kit is a grouped product, this holds its quantities.
	register_post_meta(
		'product',
		'_pleiades_kit',
		array(
			'type'          => 'string',
			'single'        => true,
			'show_in_rest'  => true,
			'auth_callback' => function () {
				return current_user_can( 'edit_products' );
			},
		)
	);
}

register_activation_hook(
	__FILE__,
	function () {
		pleiades_register_types();
		flush_rewrite_rules(); // /recipes/ works at once.
	}
);

/** Rows of {sku, quantity, note} -> products the shop has (a deleted product drops out). */
function pleiades_items( $rows ) {
	$items = array();
	foreach ( is_array( $rows ) ? $rows : array() as $row ) {
		$id      = ! empty( $row['sku'] ) ? wc_get_product_id_by_sku( $row['sku'] ) : 0;
		$product = $id ? wc_get_product( $id ) : null;
		if ( $product ) {
			$items[] = array(
				'id'       => $id,
				'name'     => wp_specialchars_decode( $product->get_name() ),
				'url'      => get_permalink( $id ),
				'price'    => (float) $product->get_price(),
				'in_stock' => $product->is_in_stock(),
				'quantity' => max( 1, (int) ( $row['quantity'] ?? 1 ) ),
				'note'     => (string) ( $row['note'] ?? '' ),
			);
		}
	}
	return $items;
}

function pleiades_post_items( $post_id ) {
	if ( PLEIADES_RECIPE === get_post_type( $post_id ) ) {
		return pleiades_items( get_post_meta( $post_id, 'ingredients', true ) );
	}
	return pleiades_items( json_decode( (string) get_post_meta( $post_id, '_pleiades_kit', true ), true ) );
}

/** Recipes (or kits, post type product) as the tools see them. */
function pleiades_bundles( $type ) {
	$args = array(
		'post_type'      => $type,
		'post_status'    => 'publish',
		'posts_per_page' => 100,
	);
	if ( 'product' === $type ) {
		$args['meta_key'] = '_pleiades_kit'; // phpcs:ignore WordPress.DB.SlowDBQuery
	}
	$bundles = array();
	foreach ( get_posts( $args ) as $post ) {
		$bundles[] = array(
			'name'         => wp_specialchars_decode( $post->post_title ),
			'url'          => get_permalink( $post ),
			'servings'     => (int) get_post_meta( $post->ID, 'servings', true ),
			'time_minutes' => (int) get_post_meta( $post->ID, 'time_minutes', true ),
			'items'        => array_map(
				function ( $i ) {
					return array_intersect_key( $i, array_flip( array( 'id', 'name', 'quantity' ) ) );
				},
				pleiades_post_items( $post->ID )
			),
		);
	}
	return $bundles;
}

/** A single recipe, or a single product that is a kit. */
function pleiades_bundle_page() {
	return pleiades_has_woo() && ( is_singular( PLEIADES_RECIPE ) || ( is_singular( 'product' ) && get_post_meta( get_queried_object_id(), '_pleiades_kit', true ) ) );
}

add_filter(
	'the_content',
	function ( $content ) {
		if ( ! pleiades_bundle_page() || ! in_the_loop() || ! is_main_query() ) {
			return $content;
		}
		$id    = get_the_ID();
		$items = pleiades_post_items( $id );
		if ( ! $items ) {
			return $content;
		}
		$is_recipe = PLEIADES_RECIPE === get_post_type( $id );
		$total     = 0;
		$html      = '';
		if ( $is_recipe ) {
			$servings = (int) get_post_meta( $id, 'servings', true );
			$minutes  = (int) get_post_meta( $id, 'time_minutes', true );
			$html    .= '<p class="pleiades-recipe-meta">' . esc_html( trim( ( $servings ? "Serves $servings" : '' ) . ( $minutes ? " · $minutes min" : '' ), ' ·' ) ) . '</p><h2>Ingredients</h2><ul class="pleiades-ingredients">';
		}
		foreach ( $items as $i ) {
			$total += $i['price'] * $i['quantity'];
			if ( $is_recipe ) {
				$html .= sprintf(
					'<li>%d × <a href="%s">%s</a>%s — %s%s</li>',
					$i['quantity'],
					esc_url( $i['url'] ),
					esc_html( $i['name'] ),
					$i['note'] ? ' (' . esc_html( $i['note'] ) . ')' : '',
					wc_price( $i['price'] ),
					$i['in_stock'] ? '' : ' <em>out of stock</em>'
				);
			}
		}
		$html .= $is_recipe ? '</ul>' : '';
		$data  = array_map(
			function ( $i ) {
				return array_intersect_key( $i, array_flip( array( 'id', 'name', 'quantity' ) ) );
			},
			$items
		);
		$html .= sprintf(
			'<p class="pleiades-add-all-row"><button type="button" class="pleiades-add-all button wp-element-button" data-items="%s" hidden>%s (%s)</button><span class="pleiades-add-status" role="status"></span></p>',
			esc_attr( wp_json_encode( $data ) ),
			$is_recipe ? 'Add all ingredients to cart' : 'Add the whole kit to cart',
			wp_kses_post( wc_price( $total ) )
		);
		return $html . $content;
	}
);

// Block themes do not print the archive description: add it under the archive title.
add_filter(
	'render_block_core/query-title',
	function ( $html ) {
		return is_post_type_archive( PLEIADES_RECIPE ) ? $html . '<p>' . esc_html( get_post_type_object( PLEIADES_RECIPE )->description ) . '</p>' : $html;
	}
);
