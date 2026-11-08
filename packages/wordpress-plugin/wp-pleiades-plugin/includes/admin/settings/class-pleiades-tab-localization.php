<?php
defined( 'ABSPATH' ) || exit;

final class Pleiades_Tab_Localization extends Pleiades_Settings_Tab {

	public function id() {
		return 'localization';
	}

	public function label() {
		return __( 'Localization', 'wp-pleiades-plugin' );
	}

	/** Translated labels of the four main fields; the other texts are labelled by their dictionary key. */
	private function main_labels() {
		return array(
			'heading'     => __( 'Heading', 'wp-pleiades-plugin' ),
			'greeting'    => __( 'Greeting', 'wp-pleiades-plugin' ),
			'placeholder' => __( 'Input placeholder', 'wp-pleiades-plugin' ),
			'examples'    => __( 'Example questions (one per line)', 'wp-pleiades-plugin' ),
		);
	}

	public function render( $s ) {
		$languages = Pleiades_Options::languages();
		$main      = $this->main_labels();
		?>
		<tr><th><label for="pl-lang"><?php esc_html_e( 'Widget language', 'wp-pleiades-plugin' ); ?></label></th>
			<td><select id="pl-lang" name="<?php echo esc_attr( $this->name( 'lang' ) ); ?>">
				<option value=""><?php esc_html_e( 'Automatic (visitor / page language, no overrides)', 'wp-pleiades-plugin' ); ?></option>
				<?php foreach ( $languages as $code => $label ) : ?>
					<option value="<?php echo esc_attr( $code ); ?>" <?php selected( $s['lang'], $code ); ?>><?php echo esc_html( $label ); ?></option>
				<?php endforeach; ?>
			</select>
			<p class="description"><?php esc_html_e( 'Only the texts of the selected language are printed. A field left empty keeps the widget default (shown as the placeholder).', 'wp-pleiades-plugin' ); ?></p>
			<?php if ( '' !== $s['heading'] || '' !== $s['greeting'] ) : ?>
				<p class="description"><?php esc_html_e( 'Heading and greeting saved by an earlier version are still used for the selected language while its own field is empty.', 'wp-pleiades-plugin' ); ?></p>
			<?php endif; ?></td></tr>
		<?php
		foreach ( $languages as $code => $lang_label ) {
			echo '<tr><th colspan="2"><h2>' . esc_html( $lang_label ) . '</h2></th></tr>';
			foreach ( Pleiades_Options::fields() as $field => $key ) {
				$id      = "pl-l10n-$code-$field";
				$value   = $s['l10n'][ $code ][ $field ] ?? '';
				$default = Pleiades_Options::default_text( $code, $field );
				$name    = $this->name( 'l10n', $code, $field );
				if ( 'examples' === $field ) {
					printf(
						'<tr><th><label for="%1$s">%2$s</label></th><td><textarea id="%1$s" class="large-text" rows="3" name="%3$s" placeholder="%5$s">%4$s</textarea></td></tr>',
						esc_attr( $id ),
						esc_html( $main[ $field ] ),
						esc_attr( $name ),
						esc_textarea( $value ),
						esc_attr( $default )
					);
				} elseif ( isset( $main[ $field ] ) ) {
					$this->text_row( $id, $main[ $field ], $name, $value, 'placeholder="' . esc_attr( $default ) . '"' );
				} else {
					$this->text_row( $id, '<code>' . esc_html( $field ) . '</code>', $name, $value, 'placeholder="' . esc_attr( $default ) . '"', '', true );
				}
			}
		}
		// Marker so sanitize() knows this tab was submitted even when every field is empty.
		?>
		<input type="hidden" name="<?php echo esc_attr( $this->name( 'l10n', '_tab' ) ); ?>" value="1">
		<?php
	}
}
