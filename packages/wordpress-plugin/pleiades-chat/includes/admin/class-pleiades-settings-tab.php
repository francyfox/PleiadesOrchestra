<?php
/**
 * Base class of a settings tab.
 *
 * @package Pleiades_Chat
 * @since   0.4.0
 */

defined( 'ABSPATH' ) || exit;

/**
 * One tab of the settings screen. Both tabs post to the same option; Pleiades_Options::sanitize keeps the other tab's values.
 *
 * @since 0.4.0
 */
abstract class Pleiades_Settings_Tab {

	/**
	 * Tab ID, used in the `tab` query var.
	 *
	 * @since 0.4.0
	 *
	 * @return string
	 */
	abstract public function id();

	/**
	 * Translated tab title.
	 *
	 * @since 0.4.0
	 *
	 * @return string
	 */
	abstract public function label();

	/**
	 * Prints the form rows (inside a form-table).
	 *
	 * @since 0.4.0
	 *
	 * @param array $settings Settings as returned by Pleiades_Options::get().
	 * @return void
	 */
	abstract public function render( $settings );

	/**
	 * Form field name inside the option array, e.g. name( 'key' ) or name( 'l10n', 'ru', 'heading' ).
	 *
	 * @since 0.4.0
	 *
	 * @param string ...$path Keys from the option root.
	 * @return string Name like `pleiades_assistant[l10n][ru][heading]`.
	 */
	protected function name( ...$path ) {
		return Pleiades_Options::NAME . '[' . implode( '][', $path ) . ']';
	}

	/**
	 * Prints a text input row.
	 *
	 * `$extra` is printed unescaped: only our own tabs pass static attributes. `$description` is
	 * limited by wp_kses to code and links; `$label` may hold <code> when `$label_html` is true.
	 *
	 * @since 0.4.0
	 *
	 * @param string $field_id    Input ID, also the label's `for`.
	 * @param string $label       Row label.
	 * @param string $name        Input name.
	 * @param string $value       Current value.
	 * @param string $extra       Extra static attributes for the input.
	 * @param string $description Help text below the input (HTML allowed: code, a).
	 * @param bool   $label_html  Whether the label is HTML (code only) instead of plain text.
	 * @return void
	 */
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
