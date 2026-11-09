<?php
/**
 * Plugin bootstrap: loads the classes and registers hooks.
 *
 * @package Pleiades_Chat
 * @since   0.4.0
 */

defined( 'ABSPATH' ) || exit;

/**
 * Bootstrap: loads the classes and wires the hooks.
 *
 * @since 0.4.0
 */
final class Pleiades_Plugin {

	/**
	 * Loads the classes, registers the hooks and, in the admin, the settings screen.
	 *
	 * @since 0.4.0
	 *
	 * @return void
	 */
	public static function init() {
		// Literal paths: editors and static analysers follow them (a loop over names is invisible to them).
		require_once __DIR__ . '/class-pleiades-options.php';
		require_once __DIR__ . '/class-pleiades-context.php';
		require_once __DIR__ . '/class-pleiades-assets.php';
		require_once __DIR__ . '/class-pleiades-recipes.php';

		add_action( 'init', array( 'Pleiades_Recipes', 'register_types' ) );
		add_action( 'wp_enqueue_scripts', array( 'Pleiades_Assets', 'enqueue' ) );
		add_action( 'wp_footer', array( 'Pleiades_Context', 'print_widget' ) );
		add_action( 'save_post', array( 'Pleiades_Recipes', 'flush_cache' ) );
		add_action( 'delete_post', array( 'Pleiades_Recipes', 'flush_cache' ) );
		add_filter( 'the_content', array( 'Pleiades_Recipes', 'content' ) );
		add_filter( 'render_block_core/query-title', array( 'Pleiades_Recipes', 'archive_description' ) );
		register_activation_hook( PLEIADES_FILE, array( __CLASS__, 'activate' ) );

		if ( is_admin() ) {
			require_once __DIR__ . '/admin/class-pleiades-admin.php';
			Pleiades_Admin::init();
		}
	}

	/**
	 * Activation hook: registers the recipe type and flushes rewrite rules.
	 *
	 * @since 0.4.0
	 *
	 * @return void
	 */
	public static function activate() {
		Pleiades_Recipes::register_types();
		flush_rewrite_rules();
	}
}
