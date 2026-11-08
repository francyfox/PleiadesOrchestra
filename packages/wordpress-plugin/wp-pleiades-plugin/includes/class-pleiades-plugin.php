<?php
defined( 'ABSPATH' ) || exit;

/** Bootstrap: loads the classes and wires the hooks. */
final class Pleiades_Plugin {

	public static function init() {
		$dir = plugin_dir_path( PLEIADES_FILE ) . 'includes/';
		foreach ( array( 'options', 'context', 'assets', 'recipes' ) as $name ) {
			require_once $dir . "class-pleiades-$name.php";
		}

		add_action( 'init', array( __CLASS__, 'load_textdomain' ) );
		add_action( 'init', array( 'Pleiades_Recipes', 'register_types' ) );
		add_action( 'wp_enqueue_scripts', array( 'Pleiades_Assets', 'enqueue' ) );
		add_action( 'wp_footer', array( 'Pleiades_Context', 'print_widget' ) );
		add_filter( 'the_content', array( 'Pleiades_Recipes', 'content' ) );
		add_filter( 'render_block_core/query-title', array( 'Pleiades_Recipes', 'archive_description' ) );
		register_activation_hook( PLEIADES_FILE, array( __CLASS__, 'activate' ) );

		if ( is_admin() ) {
			require_once $dir . 'admin/class-pleiades-admin.php';
			Pleiades_Admin::init();
		}
	}

	public static function load_textdomain() {
		load_plugin_textdomain( 'wp-pleiades-plugin', false, dirname( plugin_basename( PLEIADES_FILE ) ) . '/languages' );
	}

	public static function activate() {
		Pleiades_Recipes::register_types();
		flush_rewrite_rules(); // /recipes/ works at once.
	}
}
