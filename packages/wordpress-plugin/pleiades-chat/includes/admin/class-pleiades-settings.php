<?php
/**
 * Settings API wiring and the tab router.
 *
 * @package Pleiades_Chat
 * @since   0.4.0
 */

defined( 'ABSPATH' ) || exit;

require_once __DIR__ . '/class-pleiades-settings-tab.php';
require_once __DIR__ . '/settings/class-pleiades-tab-general.php';
require_once __DIR__ . '/settings/class-pleiades-tab-localization.php';

/**
 * Settings API wiring and the tab router.
 *
 * The form posts to options.php, which checks the nonce (settings_fields) and the
 * `manage_options` capability and then calls Pleiades_Options::sanitize; no own handler.
 *
 * @since 0.4.0
 */
final class Pleiades_Settings {

	/**
	 * Settings group; the same name as the option.
	 *
	 * @since 0.4.0
	 * @var string
	 */
	const GROUP = Pleiades_Options::NAME;
	/**
	 * Tab shown when `tab` is missing or unknown.
	 *
	 * @since 0.4.0
	 * @var string
	 */
	const DEFAULT_TAB = 'general';

	/**
	 * The tabs, in display order.
	 *
	 * @since 0.4.0
	 *
	 * @return array<string, Pleiades_Settings_Tab> Tab ID => tab.
	 */
	public static function tabs() {
		$tabs = array();
		foreach ( array( new Pleiades_Tab_General(), new Pleiades_Tab_Localization() ) as $tab ) {
			$tabs[ $tab->id() ] = $tab;
		}
		return $tabs;
	}

	/**
	 * Registers the option with its sanitize callback.
	 *
	 * Hooked to `admin_init`. The settings group has the same name as the option.
	 *
	 * @since 0.4.0
	 *
	 * @return void
	 */
	public static function register() {
		register_setting(
			self::GROUP,
			Pleiades_Options::NAME,
			array(
				'type'              => 'array',
				'sanitize_callback' => array( 'Pleiades_Options', 'sanitize' ),
				'default'           => array(),
			)
		);
	}

	/**
	 * Prints the settings screen: legal notice, tab navigation and the active tab's form.
	 *
	 * Re-checks `manage_options` as the page callback. The `tab` query var only picks which tab to show
	 * (sanitized, unknown values fall back to general), so it needs no nonce.
	 *
	 * @since 0.4.0
	 *
	 * @return void
	 */
	public static function render() {
		if ( ! current_user_can( Pleiades_Admin::CAPABILITY ) ) {
			return;
		}
		$tabs   = self::tabs();
		$active = self::active_tab_id( $tabs );
		?>
		<div class="wrap">
			<h1><?php echo esc_html( Pleiades_Admin::TITLE ); ?></h1>
			<?php self::render_links(); ?>
			<?php self::render_data_notice(); ?>
			<?php self::render_tab_navigation( $tabs, $active ); ?>
			<form method="post" action="options.php">
				<?php settings_fields( self::GROUP ); ?>
				<table class="form-table" role="presentation">
					<?php $tabs[ $active ]->render( Pleiades_Options::get() ); ?>
				</table>
				<?php submit_button(); ?>
			</form>
		</div>
		<?php
	}

	/**
	 * ID of the tab named by the `tab` query var; the default tab when it is missing or unknown.
	 *
	 * @since 0.4.0
	 *
	 * @param array<string, Pleiades_Settings_Tab> $tabs Tab ID => tab.
	 * @return string Tab ID.
	 */
	private static function active_tab_id( $tabs ) {
		$requested = isset( $_GET['tab'] ) ? sanitize_key( wp_unslash( $_GET['tab'] ) ) : ''; // phpcs:ignore WordPress.Security.NonceVerification -- a read-only tab switch.
		return isset( $tabs[ $requested ] ) ? $requested : self::DEFAULT_TAB;
	}

	/**
	 * Prints the Website and Panel buttons.
	 *
	 * @since 0.4.0
	 *
	 * @return void
	 */
	private static function render_links() {
		?>
		<p class="pleiades-links">
			<a class="button" href="<?php echo esc_url( PLEIADES_SITE_URL ); ?>" target="_blank" rel="noopener noreferrer"><?php esc_html_e( 'Website', 'pleiades-chat' ); ?></a>
			<a class="button button-primary" href="<?php echo esc_url( PLEIADES_PANEL_URL ); ?>" target="_blank" rel="noopener noreferrer"><?php esc_html_e( 'Panel', 'pleiades-chat' ); ?></a>
		</p>
		<?php
	}

	/**
	 * Prints what leaves the site once a visitor opens the chat, with links to the terms and the privacy policy.
	 *
	 * @since 0.4.0
	 *
	 * @return void
	 */
	private static function render_data_notice() {
		echo '<p>';
		printf(
			/* translators: 1: link to the terms of service, 2: link to the privacy policy */
			wp_kses( __( 'Once a visitor opens the chat, their messages, the page address and cart facts, and the list of assistant tools of this site go to the agent URL below (by default the hosted Pleiades service) and to the language model providers it uses. See the %1$s and the %2$s, and mention it in your own privacy policy.', 'pleiades-chat' ), array() ),
			Pleiades_Admin::link( PLEIADES_TERMS_URL, __( 'terms of service', 'pleiades-chat' ) ), // phpcs:ignore WordPress.Security.EscapeOutput -- link() escapes.
			Pleiades_Admin::link( PLEIADES_PRIVACY_URL, __( 'privacy policy', 'pleiades-chat' ) ) // phpcs:ignore WordPress.Security.EscapeOutput -- link() escapes.
		);
		echo '</p>';
	}

	/**
	 * Prints the tab navigation.
	 *
	 * @since 0.4.0
	 *
	 * @param array<string, Pleiades_Settings_Tab> $tabs   Tab ID => tab.
	 * @param string                               $active ID of the tab being shown.
	 * @return void
	 */
	private static function render_tab_navigation( $tabs, $active ) {
		?>
		<nav class="nav-tab-wrapper">
			<?php foreach ( $tabs as $id => $tab ) : ?>
				<a class="nav-tab <?php echo $id === $active ? 'nav-tab-active' : ''; ?>" href="<?php echo esc_url( Pleiades_Admin::settings_url( array( 'tab' => $id ) ) ); ?>"><?php echo esc_html( $tab->label() ); ?></a>
			<?php endforeach; ?>
		</nav>
		<?php
	}
}
