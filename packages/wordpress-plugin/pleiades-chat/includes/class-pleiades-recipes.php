<?php
/**
 * Recipes (custom post type) and kits (grouped products).
 *
 * @package Pleiades_Chat
 * @since   0.4.0
 */

defined( 'ABSPATH' ) || exit;

/**
 * Recipes (custom post type) and kits (grouped products): named lists of products.
 *
 * Recipe meta: `servings` (int), `time_minutes` (int), `ingredients` (list of {sku, quantity, note}).
 * Kit: a WooCommerce grouped product with product meta `_pleiades_kit`, JSON text [{"sku", "quantity"}].
 *
 * @since 0.4.0
 */
final class Pleiades_Recipes {

	/**
	 * Post type of a recipe.
	 *
	 * @since 0.4.0
	 * @var string
	 */
	const RECIPE = 'pleiades_recipe';
	/**
	 * Post type a kit is: a WooCommerce product.
	 *
	 * @since 0.4.0
	 * @var string
	 */
	const KIT_TYPE = 'product';
	/**
	 * Product meta that makes a product a kit: JSON text [{"sku": "...", "quantity": n}].
	 *
	 * @since 0.4.0
	 * @var string
	 */
	const KIT_META = '_pleiades_kit';
	/**
	 * Recipe meta holding the ingredient rows.
	 *
	 * @since 0.4.0
	 * @var string
	 */
	const INGREDIENTS_META = 'ingredients';
	/**
	 * Recipe meta keys with a whole number.
	 *
	 * @since 0.4.0
	 * @var string[]
	 */
	const NUMBER_METAS = array( 'servings', 'time_minutes' );
	/**
	 * Most recipes (or kits) the tools get.
	 *
	 * @since 0.4.0
	 * @var int
	 */
	const BUNDLE_LIMIT = 100;
	/**
	 * Item fields the tools need.
	 *
	 * @since 0.4.0
	 * @var string[]
	 */
	const BRIEF_FIELDS = array( 'id', 'name', 'quantity' );
	/**
	 * Transient prefix of the cached bundle lists (suffix: post type).
	 *
	 * @since 0.5.0
	 * @var string
	 */
	const CACHE_PREFIX = 'pleiades_bundles_';
	/**
	 * Seconds a cached bundle list lives at most (saves and deletes clear it sooner).
	 *
	 * @since 0.5.0
	 * @var int
	 */
	const CACHE_TTL = HOUR_IN_SECONDS;
	/**
	 * Most ingredient rows of a recipe, saved through REST.
	 *
	 * @since 0.5.0
	 * @var int
	 */
	const MAX_INGREDIENTS = 100;
	/**
	 * Largest number a quantity, servings or minutes may hold.
	 *
	 * @since 0.5.0
	 * @var int
	 */
	const MAX_NUMBER = 9999;
	/**
	 * Longest SKU or note text in an ingredient row.
	 *
	 * @since 0.5.0
	 * @var int
	 */
	const MAX_TEXT = 200;

	/**
	 * Registers the recipe post type, its REST-visible meta and the kit meta of products.
	 *
	 * Hooked to `init`; also called on activation so the rewrite rules know /recipes/.
	 * Editing the kit meta needs `edit_products`.
	 *
	 * @since 0.4.0
	 *
	 * @return void
	 */
	public static function register_types() {
		self::register_recipe_type();
		self::register_recipe_meta();
		self::register_kit_meta();
	}

	/**
	 * Registers the public recipe post type with its /recipes/ archive.
	 *
	 * @since 0.4.0
	 *
	 * @return void
	 */
	private static function register_recipe_type() {
		register_post_type(
			self::RECIPE,
			array(
				'label'        => __( 'Recipes', 'pleiades-chat' ),
				'labels'       => array( 'singular_name' => __( 'Recipe', 'pleiades-chat' ) ),
				'description'  => __( 'Simple recipes: add every ingredient to the cart in one click.', 'pleiades-chat' ),
				'public'       => true,
				'has_archive'  => 'recipes',
				'rewrite'      => array( 'slug' => 'recipes' ),
				'show_in_rest' => true,
				'menu_icon'    => 'dashicons-carrot',
				'supports'     => array( 'title', 'editor', 'thumbnail', 'excerpt', 'custom-fields' ),
			)
		);
	}

	/**
	 * Registers servings, time and the ingredient rows as REST-visible recipe meta.
	 *
	 * @since 0.4.0
	 *
	 * @return void
	 */
	private static function register_recipe_meta() {
		foreach ( self::NUMBER_METAS as $key ) {
			register_post_meta(
				self::RECIPE,
				$key,
				array(
					'type'              => 'integer',
					'single'            => true,
					'sanitize_callback' => 'absint',
					'show_in_rest'      => array( 'schema' => array( 'type' => 'integer', 'minimum' => 0, 'maximum' => self::MAX_NUMBER ) ),
				)
			);
		}
		register_post_meta(
			self::RECIPE,
			self::INGREDIENTS_META,
			array(
				'type'         => 'array',
				'single'       => true,
				'show_in_rest' => array(
					'schema' => array(
						'type'     => 'array',
						'maxItems' => self::MAX_INGREDIENTS,
						'items'    => array(
							'type'                 => 'object',
							'properties'           => array(
								'sku'      => array( 'type' => 'string', 'maxLength' => self::MAX_TEXT ),
								'quantity' => array( 'type' => 'integer', 'minimum' => 1, 'maximum' => self::MAX_NUMBER ),
								'note'     => array( 'type' => 'string', 'maxLength' => self::MAX_TEXT ),
							),
							'additionalProperties' => false,
						),
					),
				),
			)
		);
	}

	/**
	 * Registers the kit meta of products; only users who can edit products may write it.
	 *
	 * @since 0.4.0
	 *
	 * @return void
	 */
	private static function register_kit_meta() {
		register_post_meta(
			self::KIT_TYPE,
			self::KIT_META,
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

	/**
	 * Resolves rows of {sku, quantity, note} to the products the shop has; a deleted product drops out.
	 *
	 * Quantity is at least 1. Needs WooCommerce.
	 *
	 * @since 0.4.0
	 *
	 * @param mixed $rows Decoded rows; anything but an array gives no items.
	 * @return array<int, array{id: int, name: string, url: string, price: float, in_stock: bool, quantity: int, note: string}> Items.
	 */
	private static function items( $rows ) {
		if ( ! is_array( $rows ) ) {
			return array();
		}
		$items = array();
		foreach ( $rows as $row ) {
			$item = self::item( $row );
			if ( $item ) {
				$items[] = $item;
			}
		}
		return $items;
	}

	/**
	 * Resolves one row to its product.
	 *
	 * @since 0.4.0
	 *
	 * @param mixed $row A {sku, quantity, note} row.
	 * @return array|null The item as described in items(), null when the SKU is empty or unknown.
	 */
	private static function item( $row ) {
		if ( empty( $row['sku'] ) ) {
			return null;
		}
		$id      = wc_get_product_id_by_sku( $row['sku'] );
		$product = $id ? wc_get_product( $id ) : null;
		if ( ! $product ) {
			return null;
		}
		return array(
			'id'       => $id,
			'name'     => wp_specialchars_decode( $product->get_name() ),
			'url'      => get_permalink( $id ),
			'price'    => (float) $product->get_price(),
			'in_stock' => $product->is_in_stock(),
			'quantity' => max( 1, (int) ( $row['quantity'] ?? 1 ) ),
			'note'     => (string) ( $row['note'] ?? '' ),
		);
	}

	/**
	 * Items of a recipe (meta `ingredients`) or of a kit (JSON meta `_pleiades_kit`).
	 *
	 * @since 0.4.0
	 *
	 * @param int $post_id Recipe or product ID.
	 * @return array<int, array> Items as returned by items().
	 */
	private static function post_items( $post_id ) {
		if ( self::is_recipe( $post_id ) ) {
			return self::items( get_post_meta( $post_id, self::INGREDIENTS_META, true ) );
		}
		return self::items( json_decode( (string) get_post_meta( $post_id, self::KIT_META, true ), true ) );
	}

	/**
	 * Whether the post is a recipe (otherwise it is a kit).
	 *
	 * @since 0.4.0
	 *
	 * @param int $post_id Post ID.
	 * @return bool
	 */
	private static function is_recipe( $post_id ) {
		return self::RECIPE === get_post_type( $post_id );
	}

	/**
	 * Reduces items to the fields the tools need.
	 *
	 * @since 0.4.0
	 *
	 * @param array<int, array> $items Items as returned by items().
	 * @return array<int, array{id: int, name: string, quantity: int}> Short items.
	 */
	private static function brief( $items ) {
		return array_map(
			function ( $item ) {
				return array_intersect_key( $item, array_flip( self::BRIEF_FIELDS ) );
			},
			$items
		);
	}

	/**
	 * Recipes (or kits, post type product) as the tools see them; at most 100, password-protected ones left out.
	 *
	 * Cached in a transient per type (the lookup costs about 10 queries per bundle on every page);
	 * save_post and delete_post of recipes and products clear it, see flush_cache().
	 *
	 * @since 0.4.0
	 *
	 * @param string $type Post type: 'pleiades_recipe' for recipes, 'product' for kits.
	 * @return array<int, array{name: string, url: string, servings: int, time_minutes: int, items: array}> Bundles.
	 */
	public static function bundles( $type ) {
		$cached = get_transient( self::CACHE_PREFIX . $type );
		if ( is_array( $cached ) ) {
			return $cached;
		}
		$args = array(
			'post_type'      => $type,
			'post_status'    => 'publish',
			'has_password'   => false,
			'posts_per_page' => self::BUNDLE_LIMIT,
		);
		if ( self::KIT_TYPE === $type ) {
			$args['meta_key'] = self::KIT_META; // phpcs:ignore WordPress.DB.SlowDBQuery
		}
		$bundles = array_map( array( __CLASS__, 'bundle' ), get_posts( $args ) );
		set_transient( self::CACHE_PREFIX . $type, $bundles, self::CACHE_TTL );
		return $bundles;
	}

	/**
	 * Clears the cached bundle list of a post's type; hooked to `save_post` and `delete_post`.
	 *
	 * @since 0.5.0
	 *
	 * @param int $post_id Post ID.
	 * @return void
	 */
	public static function flush_cache( $post_id ) {
		$type = get_post_type( $post_id );
		if ( self::RECIPE === $type || self::KIT_TYPE === $type ) {
			delete_transient( self::CACHE_PREFIX . $type );
		}
	}

	/**
	 * One recipe or kit as the tools see it.
	 *
	 * @since 0.4.0
	 *
	 * @param WP_Post $post Recipe or kit post.
	 * @return array{name: string, url: string, servings: int, time_minutes: int, items: array} Bundle.
	 */
	private static function bundle( $post ) {
		return array(
			'name'         => wp_specialchars_decode( $post->post_title ),
			'url'          => get_permalink( $post ),
			'servings'     => (int) get_post_meta( $post->ID, 'servings', true ),
			'time_minutes' => (int) get_post_meta( $post->ID, 'time_minutes', true ),
			'items'        => self::brief( self::post_items( $post->ID ) ),
		);
	}

	/**
	 * Whether the current page is a single recipe, or a single product that is a kit.
	 *
	 * @since 0.4.0
	 *
	 * @return bool
	 */
	public static function is_bundle_page() {
		if ( ! Pleiades_Context::has_woo() ) {
			return false;
		}
		return is_singular( self::RECIPE ) || self::is_kit_page();
	}

	/**
	 * Whether the current page is a single product that has kit meta.
	 *
	 * @since 0.4.0
	 *
	 * @return bool
	 */
	private static function is_kit_page() {
		return is_singular( self::KIT_TYPE ) && get_post_meta( get_queried_object_id(), self::KIT_META, true );
	}

	/**
	 * Filter on `the_content`: prepends the ingredient list (recipes) and the hidden "Add all" button.
	 *
	 * Only the main loop of a recipe or kit page with at least one item is changed. The button
	 * is `hidden` until tools.js un-hides it, so without JS nothing useless shows.
	 *
	 * @since 0.4.0
	 *
	 * @param string $content Post content.
	 * @return string Content, with the list and button in front on bundle pages.
	 */
	public static function content( $content ) {
		if ( ! self::is_bundle_page() || ! in_the_loop() || ! is_main_query() || post_password_required() ) {
			return $content;
		}
		$post_id = get_the_ID();
		$items   = self::post_items( $post_id );
		if ( ! $items ) {
			return $content;
		}
		$is_recipe = self::is_recipe( $post_id );
		$html      = $is_recipe ? self::ingredients_html( $post_id, $items ) : '';
		return $html . self::add_all_html( $items, $is_recipe ) . $content;
	}

	/**
	 * Servings and time line, heading and the list of ingredients of a recipe.
	 *
	 * @since 0.4.0
	 *
	 * @param int               $recipe_id Recipe ID.
	 * @param array<int, array> $items     Items as returned by items().
	 * @return string HTML.
	 */
	private static function ingredients_html( $recipe_id, $items ) {
		$html  = '<p class="pleiades-recipe-meta">' . esc_html( self::servings_and_time( $recipe_id ) ) . '</p>';
		$html .= '<h2>' . esc_html__( 'Ingredients', 'pleiades-chat' ) . '</h2><ul class="pleiades-ingredients">';
		foreach ( $items as $item ) {
			$html .= self::ingredient_html( $item );
		}
		return $html . '</ul>';
	}

	/**
	 * "Serves 4 · 25 min"; a part that is not set is left out.
	 *
	 * @since 0.4.0
	 *
	 * @param int $recipe_id Recipe ID.
	 * @return string Plain text.
	 */
	private static function servings_and_time( $recipe_id ) {
		$servings = (int) get_post_meta( $recipe_id, 'servings', true );
		$minutes  = (int) get_post_meta( $recipe_id, 'time_minutes', true );
		/* translators: %d: number of servings */
		$serves = $servings ? sprintf( __( 'Serves %d', 'pleiades-chat' ), $servings ) : '';
		/* translators: %d: minutes */
		$time = $minutes ? sprintf( __( '%d min', 'pleiades-chat' ), $minutes ) : '';
		return implode( ' · ', array_filter( array( $serves, $time ) ) );
	}

	/**
	 * One ingredient: quantity, linked name, optional note, price and a stock mark.
	 *
	 * @since 0.4.0
	 *
	 * @param array $item Item as returned by items().
	 * @return string HTML list item.
	 */
	private static function ingredient_html( $item ) {
		$note       = $item['note'] ? ' (' . esc_html( $item['note'] ) . ')' : '';
		$stock_mark = $item['in_stock'] ? '' : ' <em>' . esc_html__( 'out of stock', 'pleiades-chat' ) . '</em>';
		return sprintf(
			'<li>%d × <a href="%s">%s</a>%s — %s%s</li>',
			$item['quantity'],
			esc_url( $item['url'] ),
			esc_html( $item['name'] ),
			$note,
			wc_price( $item['price'] ),
			$stock_mark
		);
	}

	/**
	 * The "Add all" button with the item list in `data-items` and the total price in its label.
	 *
	 * @since 0.4.0
	 *
	 * @param array<int, array> $items     Items as returned by items().
	 * @param bool              $is_recipe True for a recipe, false for a kit (changes the label).
	 * @return string HTML.
	 */
	private static function add_all_html( $items, $is_recipe ) {
		$label = $is_recipe ? esc_html__( 'Add all ingredients to cart', 'pleiades-chat' ) : esc_html__( 'Add the whole kit to cart', 'pleiades-chat' );
		return sprintf(
			'<p class="pleiades-add-all-row"><button type="button" class="pleiades-add-all button wp-element-button" data-items="%s" hidden>%s (%s)</button><span class="pleiades-add-status" role="status"></span></p>',
			esc_attr( wp_json_encode( self::brief( $items ) ) ),
			$label,
			wp_kses_post( wc_price( self::total_price( $items ) ) )
		);
	}

	/**
	 * Sum of price times quantity.
	 *
	 * @since 0.4.0
	 *
	 * @param array<int, array> $items Items as returned by items().
	 * @return float Total.
	 */
	private static function total_price( $items ) {
		$total = 0;
		foreach ( $items as $item ) {
			$total += $item['price'] * $item['quantity'];
		}
		return $total;
	}

	/**
	 * Filter on `render_block_core/query-title`: block themes do not print the archive description, add it under the archive title.
	 *
	 * @since 0.4.0
	 *
	 * @param string $html Rendered title block.
	 * @return string The block, with the description on the recipe archive.
	 */
	public static function archive_description( $html ) {
		if ( ! is_post_type_archive( self::RECIPE ) ) {
			return $html;
		}
		return $html . '<p>' . esc_html( get_post_type_object( self::RECIPE )->description ) . '</p>';
	}
}
