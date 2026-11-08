<?php
defined( 'ABSPATH' ) || exit;

/** The single option array `pleiades_assistant` (name kept so existing sites keep their settings). */
final class Pleiades_Options {

	const NAME      = 'pleiades_assistant';
	const POSITIONS = array( 'bottom-left', 'bottom-right', 'top-left', 'top-right' );
	/** Widget attribute => the dictionary key of the same text (the other keys go in the `labels` attribute). */
	const MAIN_KEYS = array(
		'heading'     => 'title',
		'greeting'    => 'hello',
		'placeholder' => 'ph',
		'examples'    => 'examples',
	);

	/** The widget's own dictionary (generated from its i18n.ts by `bun run build`): `langs` code => name, `strings` code => key => text. */
	public static function widget_i18n() {
		static $data = null;
		if ( null === $data ) {
			$data = json_decode( (string) file_get_contents( __DIR__ . '/widget-i18n.json' ), true );
		}
		return $data;
	}

	/** Languages the widget supports: code => name in its own language. */
	public static function languages() {
		return self::widget_i18n()['langs'];
	}

	/** Overridable fields: field => widget dictionary key. Main attributes first, then every other text key as `labels`. */
	public static function fields() {
		$fields = self::MAIN_KEYS;
		foreach ( self::widget_i18n()['strings']['en'] as $key => $text ) {
			if ( is_string( $text ) && ! in_array( $key, self::MAIN_KEYS, true ) ) {
				$fields[ $key ] = $key;
			}
		}
		return $fields;
	}

	/** The widget's default text of a field in a language ('' if none). */
	public static function default_text( $code, $field ) {
		$text = self::widget_i18n()['strings'][ $code ][ self::fields()[ $field ] ] ?? '';
		return is_array( $text ) ? implode( "\n", $text ) : $text;
	}

	public static function get() {
		return wp_parse_args(
			get_option( self::NAME, array() ),
			array(
				'key'       => '',
				'agent_url' => PLEIADES_DEFAULT_AGENT_URL,
				'position'  => 'bottom-right',
				'greeting'  => '', // Legacy (before 0.5): fallback while a language has no own value; kept, no longer edited.
				'heading'   => '',
				'lang'      => '', // '' = the widget picks (visitor, <html lang>, browser).
				'l10n'      => array(),
			)
		);
	}

	/** Sanitizes the fields of one tab and keeps the other tabs' values (both tabs post to the same option). */
	public static function sanitize( $in ) {
		$in  = is_array( $in ) ? $in : array();
		$old = self::get();
		$out = $old;

		if ( isset( $in['key'] ) ) { // General tab.
			$key = trim( sanitize_text_field( $in['key'] ) );
			if ( '' !== $key && ! preg_match( '/^pk_[A-Za-z0-9_-]+$/', $key ) ) {
				add_settings_error( self::NAME, 'bad_key', __( 'The key must be a publishable key (starts with pk_). Never paste a secret key.', 'wp-pleiades-plugin' ) );
				$key = '';
			}
			$url         = isset( $in['agent_url'] ) ? esc_url_raw( trim( $in['agent_url'] ), array( 'http', 'https' ) ) : '';
			$position    = isset( $in['position'] ) ? sanitize_key( $in['position'] ) : '';
			$out['key']       = $key;
			$out['agent_url'] = '' !== $url ? untrailingslashit( $url ) : PLEIADES_DEFAULT_AGENT_URL;
			$out['position']  = in_array( $position, self::POSITIONS, true ) ? $position : 'bottom-right';
		}

		if ( isset( $in['l10n'] ) ) { // Localization tab.
			$lang        = isset( $in['lang'] ) ? sanitize_key( $in['lang'] ) : '';
			$out['lang'] = isset( self::languages()[ $lang ] ) ? $lang : '';
			$l10n        = array();
			foreach ( array_keys( self::languages() ) as $code ) {
				foreach ( array_keys( self::fields() ) as $field ) {
					$raw = $in['l10n'][ $code ][ $field ] ?? '';
					$raw = is_string( $raw ) ? $raw : '';
					$val = 'examples' === $field ? sanitize_textarea_field( $raw ) : sanitize_text_field( $raw );
					if ( '' !== trim( $val ) ) {
						$l10n[ $code ][ $field ] = trim( $val );
					}
				}
			}
			$out['l10n'] = $l10n;
		}
		return $out;
	}

	/** Widget attributes: [attribute => value]. The legacy heading/greeting fill in where the active language has none; `examples` become the JSON array and the other texts the `labels` object. */
	public static function widget_overrides( $s ) {
		$set    = $s['l10n'][ $s['lang'] ] ?? array();
		$out    = array();
		$labels = array();
		foreach ( array_keys( self::fields() ) as $field ) {
			$legacy = in_array( $field, array( 'heading', 'greeting' ), true ) ? $s[ $field ] : '';
			$val    = $set[ $field ] ?? $legacy;
			if ( ! is_string( $val ) || '' === trim( $val ) ) {
				continue;
			}
			if ( 'examples' === $field ) {
				$out['examples'] = wp_json_encode( array_values( array_filter( array_map( 'trim', preg_split( '/\R/', $val ) ) ) ) );
			} elseif ( isset( self::MAIN_KEYS[ $field ] ) ) {
				$out[ $field ] = $val;
			} else {
				$labels[ $field ] = $val;
			}
		}
		if ( $labels ) {
			$out['labels'] = wp_json_encode( $labels, JSON_UNESCAPED_UNICODE );
		}
		return $out;
	}
}
