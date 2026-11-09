<?php
/**
 * Admin menu entry and plugin-row links.
 *
 * @package Pleiades_Chat
 * @since   0.4.0
 */

defined( 'ABSPATH' ) || exit;

/**
 * Menu entry, plugin-row links and the settings screen.
 *
 * @since 0.4.0
 */
final class Pleiades_Admin {

	/**
	 * Settings page slug (options-general.php?page=...).
	 *
	 * @since 0.4.0
	 * @var string
	 */
	const PAGE = 'pleiades-chat';
	/**
	 * Name of the plugin as shown in the menu and on the settings screen.
	 *
	 * @since 0.4.0
	 * @var string
	 */
	const TITLE = 'Pleiades Assistant';
	/**
	 * Capability needed to open and save the settings.
	 *
	 * @since 0.4.0
	 * @var string
	 */
	const CAPABILITY = 'manage_options';

	/**
	 * Registers the admin hooks (menu, settings, plugin-row links).
	 *
	 * @since 0.4.0
	 *
	 * @return void
	 */
	public static function init() {
		require_once __DIR__ . '/class-pleiades-settings.php';
		add_action( 'admin_menu', array( __CLASS__, 'menu' ) );
		add_action( 'admin_init', array( 'Pleiades_Settings', 'register' ) );
		add_filter( 'plugin_action_links_' . plugin_basename( PLEIADES_FILE ), array( __CLASS__, 'action_links' ) );
		add_filter( 'plugin_row_meta', array( __CLASS__, 'row_meta' ), 10, 2 );
	}

	/**
	 * Adds the page under Settings; only users with `manage_options` see it.
	 *
	 * @since 0.4.0
	 *
	 * @return void
	 */
	public static function menu() {
		add_options_page( self::TITLE, self::TITLE, self::CAPABILITY, self::PAGE, array( 'Pleiades_Settings', 'render' ) );
	}

	/**
	 * An escaped link that opens in a new tab.
	 *
	 * @since 0.4.0
	 *
	 * @param string $url   Link target.
	 * @param string $label Link text.
	 * @return string HTML anchor.
	 */
	public static function link( $url, $label ) {
		return sprintf( '<a href="%s" target="_blank" rel="noopener noreferrer">%s</a>', esc_url( $url ), esc_html( $label ) );
	}

	/**
	 * Address of the settings screen.
	 *
	 * @since 0.4.0
	 *
	 * @param string[] $query_args Extra query args, e.g. array( 'tab' => 'localization' ).
	 * @return string URL.
	 */
	public static function settings_url( $query_args = array() ) {
		return add_query_arg( array( 'page' => self::PAGE ) + $query_args, admin_url( 'options-general.php' ) );
	}

	/**
	 * Filter on `plugin_action_links_{plugin}`: puts a Settings link first.
	 *
	 * @since 0.4.0
	 *
	 * @param string[] $links Action links.
	 * @return string[] Links with Settings in front.
	 */
	public static function action_links( $links ) {
		array_unshift( $links, '<a href="' . esc_url( self::settings_url() ) . '">' . esc_html__( 'Settings', 'pleiades-chat' ) . '</a>' );
		return $links;
	}

	/**
	 * Filter on `plugin_row_meta`: adds the website and panel links to this plugin's row only.
	 *
	 * @since 0.4.0
	 *
	 * @param string[] $meta Row meta links.
	 * @param string   $file Plugin basename of the row.
	 * @return string[] Meta links.
	 */
	public static function row_meta( $meta, $file ) {
		if ( plugin_basename( PLEIADES_FILE ) !== $file ) {
			return $meta;
		}
		$meta[] = self::link( PLEIADES_SITE_URL, __( 'Website', 'pleiades-chat' ) );
		$meta[] = self::link( PLEIADES_PANEL_URL, __( 'Panel (get your widget key)', 'pleiades-chat' ) );
		return $meta;
	}
}
