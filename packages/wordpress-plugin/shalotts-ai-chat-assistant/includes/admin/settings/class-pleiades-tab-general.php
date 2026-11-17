<?php
/**
 * General settings tab: key, agent URL, position.
 *
 * @package Pleiades_Chat
 * @since   0.4.0
 */

defined( 'ABSPATH' ) || exit;

/**
 * General tab: publishable key, agent URL and widget position.
 *
 * @since 0.4.0
 */
final class Pleiades_Tab_General extends Pleiades_Settings_Tab {

	/**
	 * @since 0.4.0
	 *
	 * @return string
	 */
	public function id() {
		return 'general';
	}

	/**
	 * @since 0.4.0
	 *
	 * @return string
	 */
	public function label() {
		return __( 'General', 'shalotts-ai-chat-assistant' );
	}

	/**
	 * Prints the key, agent URL and position rows.
	 *
	 * @since 0.4.0
	 *
	 * @param array $settings Settings as returned by Pleiades_Options::get().
	 * @return void
	 */
	public function render( $settings ) {
		$this->render_key_row( $settings['key'] );
		$this->text_row( 'pl-url', __( 'Agent URL', 'shalotts-ai-chat-assistant' ), $this->name( 'agent_url' ), $settings['agent_url'], 'type="url"' );
		$this->render_position_row( $settings['position'] );
	}

	/**
	 * Prints the publishable key row with the panel link and the origin the channel must allow.
	 *
	 * @since 0.4.0
	 *
	 * @param string $key Saved key.
	 * @return void
	 */
	private function render_key_row( $key ) {
		$this->text_row(
			'pl-key',
			__( 'Publishable key', 'shalotts-ai-chat-assistant' ),
			$this->name( 'key' ),
			$key,
			'placeholder="pk_…" autocomplete="off"',
			sprintf(
				/* translators: 1: link to the Shalotts panel, 2: the site address */
				__( 'From your channel in the %1$s. The channel must allow %2$s.', 'shalotts-ai-chat-assistant' ),
				Pleiades_Admin::link( PLEIADES_PANEL_URL, __( 'Shalotts panel', 'shalotts-ai-chat-assistant' ) ),
				'<code>' . esc_html( home_url() ) . '</code>'
			)
		);
	}

	/**
	 * Prints the position select.
	 *
	 * @since 0.4.0
	 *
	 * @param string $position Saved position.
	 * @return void
	 */
	private function render_position_row( $position ) {
		?>
		<tr><th><label for="pl-pos"><?php esc_html_e( 'Position', 'shalotts-ai-chat-assistant' ); ?></label></th>
			<td><select id="pl-pos" name="<?php echo esc_attr( $this->name( 'position' ) ); ?>">
				<?php foreach ( Pleiades_Options::POSITIONS as $position_option ) : ?>
					<option value="<?php echo esc_attr( $position_option ); ?>" <?php selected( $position, $position_option ); ?>><?php echo esc_html( $position_option ); ?></option>
				<?php endforeach; ?>
			</select></td></tr>
		<?php
	}
}
