<?php
/**
 * Localization settings tab: per-language widget texts.
 *
 * @package Pleiades_Chat
 * @since   0.4.0
 */

defined( 'ABSPATH' ) || exit;

/**
 * Localization tab: the widget language and per-language text overrides.
 *
 * Heading and greeting live only here; those saved by an earlier version are still used as fallback.
 *
 * @since 0.4.0
 */
final class Pleiades_Tab_Localization extends Pleiades_Settings_Tab {

	/**
	 * Name of the hidden input that tells Pleiades_Options::sanitize this tab was submitted, even with every field empty.
	 *
	 * @since 0.4.0
	 * @var string
	 */
	const SUBMITTED_MARKER = '_tab';

	/**
	 * @since 0.4.0
	 *
	 * @return string
	 */
	public function id() {
		return 'localization';
	}

	/**
	 * @since 0.4.0
	 *
	 * @return string
	 */
	public function label() {
		return __( 'Localization', 'pleiades-chat' );
	}

	/**
	 * Translated labels of the four main fields; the other texts are labelled by their dictionary key.
	 *
	 * @since 0.4.0
	 *
	 * @return array<string, string> Field => label.
	 */
	private function main_labels() {
		return array(
			'heading'     => __( 'Heading', 'pleiades-chat' ),
			'greeting'    => __( 'Greeting', 'pleiades-chat' ),
			'placeholder' => __( 'Input placeholder', 'pleiades-chat' ),
			'examples'    => __( 'Example questions (one per line)', 'pleiades-chat' ),
		);
	}

	/**
	 * Prints the language select and one block of inputs per language.
	 *
	 * Inputs show the widget default as placeholder; empty means default. A hidden `l10n[_tab]` marker
	 * tells Pleiades_Options::sanitize that this tab was submitted even when every field is empty.
	 *
	 * @since 0.4.0
	 *
	 * @param array $settings Settings as returned by Pleiades_Options::get().
	 * @return void
	 */
	public function render( $settings ) {
		$this->render_language_row( $settings );
		foreach ( Pleiades_Options::languages() as $code => $language_name ) {
			echo '<tr><th colspan="2"><h2>' . esc_html( $language_name ) . '</h2></th></tr>';
			foreach ( array_keys( Pleiades_Options::fields() ) as $field ) {
				$this->render_field_row( $code, $field, $settings['l10n'][ $code ][ $field ] ?? '' );
			}
		}
		$this->render_submitted_marker();
	}

	/**
	 * Prints the widget language select and the notices under it.
	 *
	 * @since 0.4.0
	 *
	 * @param array $settings Settings as returned by Pleiades_Options::get().
	 * @return void
	 */
	private function render_language_row( $settings ) {
		?>
		<tr><th><label for="pl-lang"><?php esc_html_e( 'Widget language', 'pleiades-chat' ); ?></label></th>
			<td><select id="pl-lang" name="<?php echo esc_attr( $this->name( 'lang' ) ); ?>">
				<option value=""><?php esc_html_e( 'Automatic (visitor / page language, no overrides)', 'pleiades-chat' ); ?></option>
				<?php foreach ( Pleiades_Options::languages() as $code => $language_name ) : ?>
					<option value="<?php echo esc_attr( $code ); ?>" <?php selected( $settings['lang'], $code ); ?>><?php echo esc_html( $language_name ); ?></option>
				<?php endforeach; ?>
			</select>
			<p class="description"><?php esc_html_e( 'Only the texts of the selected language are printed. A field left empty keeps the widget default (shown as the placeholder).', 'pleiades-chat' ); ?></p>
			<?php if ( $this->has_legacy_texts( $settings ) ) : ?>
				<p class="description"><?php esc_html_e( 'Heading and greeting saved by an earlier version are still used for the selected language while its own field is empty.', 'pleiades-chat' ); ?></p>
			<?php endif; ?></td></tr>
		<?php
	}

	/**
	 * Whether a heading or greeting saved by an earlier version is still in the option.
	 *
	 * @since 0.4.0
	 *
	 * @param array $settings Settings as returned by Pleiades_Options::get().
	 * @return bool
	 */
	private function has_legacy_texts( $settings ) {
		foreach ( Pleiades_Options::LEGACY_FIELDS as $field ) {
			if ( '' !== $settings[ $field ] ) {
				return true;
			}
		}
		return false;
	}

	/**
	 * Prints the input of one field in one language.
	 *
	 * @since 0.4.0
	 *
	 * @param string $code  Language code.
	 * @param string $field Field name.
	 * @param string $value Saved text.
	 * @return void
	 */
	private function render_field_row( $code, $field, $value ) {
		$field_id    = "pl-l10n-$code-$field";
		$name        = $this->name( 'l10n', $code, $field );
		$placeholder = Pleiades_Options::default_text( $code, $field );
		if ( Pleiades_Options::EXAMPLES_FIELD === $field ) {
			$this->render_textarea_row( $field_id, $this->main_labels()[ $field ], $name, $value, $placeholder );
			return;
		}
		$placeholder_attribute = 'placeholder="' . esc_attr( $placeholder ) . '"';
		if ( isset( $this->main_labels()[ $field ] ) ) {
			$this->text_row( $field_id, $this->main_labels()[ $field ], $name, $value, $placeholder_attribute );
			return;
		}
		$this->text_row( $field_id, '<code>' . esc_html( $field ) . '</code>', $name, $value, $placeholder_attribute, '', true );
	}

	/**
	 * Prints a textarea row.
	 *
	 * @since 0.4.0
	 *
	 * @param string $field_id    Textarea ID, also the label's `for`.
	 * @param string $label       Row label.
	 * @param string $name        Textarea name.
	 * @param string $value       Current text.
	 * @param string $placeholder Widget default shown while empty.
	 * @return void
	 */
	private function render_textarea_row( $field_id, $label, $name, $value, $placeholder ) {
		printf(
			'<tr><th><label for="%1$s">%2$s</label></th><td><textarea id="%1$s" class="large-text" rows="3" name="%3$s" placeholder="%5$s">%4$s</textarea></td></tr>',
			esc_attr( $field_id ),
			esc_html( $label ),
			esc_attr( $name ),
			esc_textarea( $value ),
			esc_attr( $placeholder )
		);
	}

	/**
	 * Prints the hidden marker that tells the option's sanitizer this tab was submitted.
	 *
	 * @since 0.4.0
	 *
	 * @return void
	 */
	private function render_submitted_marker() {
		?>
		<input type="hidden" name="<?php echo esc_attr( $this->name( 'l10n', self::SUBMITTED_MARKER ) ); ?>" value="1">
		<?php
	}
}
