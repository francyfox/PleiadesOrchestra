<?php
defined( 'ABSPATH' ) || exit;

require_once __DIR__ . '/class-pleiades-settings-tab.php';
require_once __DIR__ . '/settings/class-pleiades-tab-general.php';
require_once __DIR__ . '/settings/class-pleiades-tab-localization.php';

/** Settings API wiring (nonce and option write are handled by options.php) and the tab router. */
final class Pleiades_Settings {

	public static function tabs() {
		$tabs = array();
		foreach ( array( new Pleiades_Tab_General(), new Pleiades_Tab_Localization() ) as $tab ) {
			$tabs[ $tab->id() ] = $tab;
		}
		return $tabs;
	}

	public static function register() {
		register_setting(
			'pleiades_assistant',
			Pleiades_Options::NAME,
			array(
				'type'              => 'array',
				'sanitize_callback' => array( 'Pleiades_Options', 'sanitize' ),
				'default'           => array(),
			)
		);
	}

	public static function render() {
		if ( ! current_user_can( 'manage_options' ) ) {
			return;
		}
		$tabs   = self::tabs();
		$active = isset( $_GET['tab'] ) && isset( $tabs[ sanitize_key( wp_unslash( $_GET['tab'] ) ) ] ) ? sanitize_key( wp_unslash( $_GET['tab'] ) ) : 'general'; // phpcs:ignore WordPress.Security.NonceVerification -- a read-only tab switch.
		?>
		<div class="wrap">
			<h1>Pleiades Assistant</h1>
			<p class="pleiades-links">
				<a class="button" href="<?php echo esc_url( PLEIADES_SITE_URL ); ?>" target="_blank" rel="noopener noreferrer"><?php esc_html_e( 'Website', 'wp-pleiades-plugin' ); ?></a>
				<a class="button button-primary" href="<?php echo esc_url( PLEIADES_PANEL_URL ); ?>" target="_blank" rel="noopener noreferrer"><?php esc_html_e( 'Panel', 'wp-pleiades-plugin' ); ?></a>
			</p>
			<p><?php esc_html_e( 'Messages go to the agent URL below and to the language model providers it uses. Mention it in your privacy policy.', 'wp-pleiades-plugin' ); ?></p>
			<nav class="nav-tab-wrapper">
				<?php foreach ( $tabs as $id => $tab ) : ?>
					<a class="nav-tab <?php echo $id === $active ? 'nav-tab-active' : ''; ?>" href="<?php echo esc_url( add_query_arg( array( 'page' => Pleiades_Admin::PAGE, 'tab' => $id ), admin_url( 'options-general.php' ) ) ); ?>"><?php echo esc_html( $tab->label() ); ?></a>
				<?php endforeach; ?>
			</nav>
			<form method="post" action="options.php">
				<?php settings_fields( 'pleiades_assistant' ); ?>
				<table class="form-table" role="presentation">
					<?php $tabs[ $active ]->render( Pleiades_Options::get() ); ?>
				</table>
				<?php submit_button(); ?>
			</form>
		</div>
		<?php
	}
}
