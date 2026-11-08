<?php
defined( 'ABSPATH' ) || exit;

/** One tab of the settings screen. Both tabs post to the same option; Pleiades_Options::sanitize keeps the other tab's values. */
abstract class Pleiades_Settings_Tab {

	abstract public function id();

	abstract public function label();

	/** Prints the form rows (inside a form-table). */
	abstract public function render( $s );

	/** Form field name inside the option array, e.g. name( 'key' ) or name( 'l10n', 'ru', 'heading' ). */
	protected function name( ...$path ) {
		return Pleiades_Options::NAME . '[' . implode( '][', $path ) . ']';
	}

	/** A text row. */
	protected function text_row( $field_id, $label, $name, $value, $extra = '', $description = '', $label_html = false ) {
		?>
		<tr><th><label for="<?php echo esc_attr( $field_id ); ?>"><?php echo $label_html ? wp_kses( $label, array( 'code' => array() ) ) : esc_html( $label ); ?></label></th>
			<td><input id="<?php echo esc_attr( $field_id ); ?>" class="regular-text" name="<?php echo esc_attr( $name ); ?>" value="<?php echo esc_attr( $value ); ?>" <?php echo $extra; // phpcs:ignore WordPress.Security.EscapeOutput -- static attributes passed by our own tabs. ?>>
			<?php if ( $description ) : ?>
				<p class="description"><?php echo wp_kses( $description, array( 'code' => array(), 'a' => array( 'href' => array(), 'target' => array(), 'rel' => array() ) ) ); ?></p>
			<?php endif; ?></td></tr>
		<?php
	}
}
