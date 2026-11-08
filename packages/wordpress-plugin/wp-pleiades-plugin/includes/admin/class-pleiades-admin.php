<?php
defined( 'ABSPATH' ) || exit;

/** Menu entry, plugin-row links and the settings screen. */
final class Pleiades_Admin {

	const PAGE = 'wp-pleiades-plugin';

	public static function init() {
		require_once __DIR__ . '/class-pleiades-settings.php';
		add_action( 'admin_menu', array( __CLASS__, 'menu' ) );
		add_action( 'admin_init', array( 'Pleiades_Settings', 'register' ) );
		add_filter( 'plugin_action_links_' . plugin_basename( PLEIADES_FILE ), array( __CLASS__, 'action_links' ) );
		add_filter( 'plugin_row_meta', array( __CLASS__, 'row_meta' ), 10, 2 );
	}

	public static function menu() {
		add_options_page( 'Pleiades Assistant', 'Pleiades Assistant', 'manage_options', self::PAGE, array( 'Pleiades_Settings', 'render' ) );
	}

	public static function link( $url, $label ) {
		return sprintf( '<a href="%s" target="_blank" rel="noopener noreferrer">%s</a>', esc_url( $url ), esc_html( $label ) );
	}

	public static function action_links( $links ) {
		array_unshift( $links, '<a href="' . esc_url( admin_url( 'options-general.php?page=' . self::PAGE ) ) . '">' . esc_html__( 'Settings', 'wp-pleiades-plugin' ) . '</a>' );
		return $links;
	}

	public static function row_meta( $meta, $file ) {
		if ( plugin_basename( PLEIADES_FILE ) !== $file ) {
			return $meta;
		}
		$meta[] = self::link( PLEIADES_SITE_URL, __( 'Website', 'wp-pleiades-plugin' ) );
		$meta[] = self::link( PLEIADES_PANEL_URL, __( 'Panel (get your widget key)', 'wp-pleiades-plugin' ) );
		return $meta;
	}
}
