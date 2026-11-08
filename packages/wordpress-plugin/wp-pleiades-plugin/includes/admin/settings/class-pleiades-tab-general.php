<?php
defined( 'ABSPATH' ) || exit;

final class Pleiades_Tab_General extends Pleiades_Settings_Tab {

	public function id() {
		return 'general';
	}

	public function label() {
		return __( 'General', 'wp-pleiades-plugin' );
	}

	public function render( $s ) {
		$this->text_row(
			'pl-key',
			__( 'Publishable key', 'wp-pleiades-plugin' ),
			$this->name( 'key' ),
			$s['key'],
			'placeholder="pk_…" autocomplete="off"',
			sprintf(
				/* translators: 1: link to the Pleiades panel, 2: the site address */
				__( 'From your channel in the %1$s. The channel must allow %2$s.', 'wp-pleiades-plugin' ),
				'<a href="' . esc_url( PLEIADES_PANEL_URL ) . '" target="_blank" rel="noopener noreferrer">' . esc_html__( 'Pleiades panel', 'wp-pleiades-plugin' ) . '</a>',
				'<code>' . esc_html( home_url() ) . '</code>'
			)
		);
		$this->text_row( 'pl-url', __( 'Agent URL', 'wp-pleiades-plugin' ), $this->name( 'agent_url' ), $s['agent_url'], 'type="url"' );
		?>
		<tr><th><label for="pl-pos"><?php esc_html_e( 'Position', 'wp-pleiades-plugin' ); ?></label></th>
			<td><select id="pl-pos" name="<?php echo esc_attr( $this->name( 'position' ) ); ?>">
				<?php foreach ( Pleiades_Options::POSITIONS as $p ) : ?>
					<option value="<?php echo esc_attr( $p ); ?>" <?php selected( $s['position'], $p ); ?>><?php echo esc_html( $p ); ?></option>
				<?php endforeach; ?>
			</select></td></tr>
		<?php
	}
}
