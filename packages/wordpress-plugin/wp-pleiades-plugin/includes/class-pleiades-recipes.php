<?php
defined( 'ABSPATH' ) || exit;

/** Recipes (custom post type) and kits (grouped products): named lists of products. */
final class Pleiades_Recipes {

	const RECIPE = 'pleiades_recipe';

	public static function register_types() {
		register_post_type(
			self::RECIPE,
			array(
				'label'        => __( 'Recipes', 'wp-pleiades-plugin' ),
				'labels'       => array( 'singular_name' => __( 'Recipe', 'wp-pleiades-plugin' ) ),
				'description'  => __( 'Simple recipes: add every ingredient to the cart in one click.', 'wp-pleiades-plugin' ),
				'public'       => true,
				'has_archive'  => 'recipes',
				'rewrite'      => array( 'slug' => 'recipes' ),
				'show_in_rest' => true,
				'menu_icon'    => 'dashicons-carrot',
				'supports'     => array( 'title', 'editor', 'thumbnail', 'excerpt', 'custom-fields' ),
			)
		);
		foreach ( array( 'servings', 'time_minutes' ) as $key ) {
			register_post_meta( self::RECIPE, $key, array( 'type' => 'integer', 'single' => true, 'show_in_rest' => true ) );
		}
		register_post_meta(
			self::RECIPE,
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

	/** Rows of {sku, quantity, note} -> products the shop has (a deleted product drops out). */
	private static function items( $rows ) {
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

	private static function post_items( $post_id ) {
		if ( self::RECIPE === get_post_type( $post_id ) ) {
			return self::items( get_post_meta( $post_id, 'ingredients', true ) );
		}
		return self::items( json_decode( (string) get_post_meta( $post_id, '_pleiades_kit', true ), true ) );
	}

	private static function brief( $items ) {
		return array_map(
			function ( $i ) {
				return array_intersect_key( $i, array_flip( array( 'id', 'name', 'quantity' ) ) );
			},
			$items
		);
	}

	/** Recipes (or kits, post type product) as the tools see them. */
	public static function bundles( $type ) {
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
				'items'        => self::brief( self::post_items( $post->ID ) ),
			);
		}
		return $bundles;
	}

	/** A single recipe, or a single product that is a kit. */
	public static function is_bundle_page() {
		return Pleiades_Context::has_woo() && ( is_singular( self::RECIPE ) || ( is_singular( 'product' ) && get_post_meta( get_queried_object_id(), '_pleiades_kit', true ) ) );
	}

	public static function content( $content ) {
		if ( ! self::is_bundle_page() || ! in_the_loop() || ! is_main_query() ) {
			return $content;
		}
		$id    = get_the_ID();
		$items = self::post_items( $id );
		if ( ! $items ) {
			return $content;
		}
		$is_recipe = self::RECIPE === get_post_type( $id );
		$total     = 0;
		$html      = '';
		if ( $is_recipe ) {
			$servings = (int) get_post_meta( $id, 'servings', true );
			$minutes  = (int) get_post_meta( $id, 'time_minutes', true );
			/* translators: %d: number of servings */
			$serves = $servings ? sprintf( __( 'Serves %d', 'wp-pleiades-plugin' ), $servings ) : '';
			/* translators: %d: minutes */
			$time  = $minutes ? sprintf( __( '%d min', 'wp-pleiades-plugin' ), $minutes ) : '';
			$html .= '<p class="pleiades-recipe-meta">' . esc_html( implode( ' · ', array_filter( array( $serves, $time ) ) ) ) . '</p><h2>' . esc_html__( 'Ingredients', 'wp-pleiades-plugin' ) . '</h2><ul class="pleiades-ingredients">';
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
					$i['in_stock'] ? '' : ' <em>' . esc_html__( 'out of stock', 'wp-pleiades-plugin' ) . '</em>'
				);
			}
		}
		$html .= $is_recipe ? '</ul>' : '';
		$html .= sprintf(
			'<p class="pleiades-add-all-row"><button type="button" class="pleiades-add-all button wp-element-button" data-items="%s" hidden>%s (%s)</button><span class="pleiades-add-status" role="status"></span></p>',
			esc_attr( wp_json_encode( self::brief( $items ) ) ),
			$is_recipe ? esc_html__( 'Add all ingredients to cart', 'wp-pleiades-plugin' ) : esc_html__( 'Add the whole kit to cart', 'wp-pleiades-plugin' ),
			wp_kses_post( wc_price( $total ) )
		);
		return $html . $content;
	}

	/** Block themes do not print the archive description: add it under the archive title. */
	public static function archive_description( $html ) {
		return is_post_type_archive( self::RECIPE ) ? $html . '<p>' . esc_html( get_post_type_object( self::RECIPE )->description ) . '</p>' : $html;
	}
}
