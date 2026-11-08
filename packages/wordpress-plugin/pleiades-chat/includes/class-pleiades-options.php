<?php
/**
 * The plugin option: defaults, widget dictionary and sanitizing.
 *
 * @package Pleiades_Chat
 * @since   0.4.0
 */

defined( 'ABSPATH' ) || exit;

/**
 * The single option array `pleiades_assistant` (name kept so existing sites keep their settings).
 *
 * @since 0.4.0
 */
final class Pleiades_Options {

	/**
	 * Option name in wp_options.
	 *
	 * @since 0.4.0
	 * @var string
	 */
	const NAME      = 'pleiades_assistant';
	/**
	 * Publishable widget keys look like this; secret keys (sk_...) never match.
	 *
	 * @since 0.4.0
	 * @var string
	 */
	const KEY_PATTERN = '/^pk_[A-Za-z0-9_-]+$/';
	/**
	 * Widget position used when none or an unknown one is saved.
	 *
	 * @since 0.4.0
	 * @var string
	 */
	const DEFAULT_POSITION = 'bottom-right';
	/**
	 * Value of the language setting that leaves the choice to the widget (visitor, <html lang>, browser).
	 *
	 * @since 0.4.0
	 * @var string
	 */
	const LANG_AUTOMATIC = '';
	/**
	 * The field whose text is a list, one entry per line.
	 *
	 * @since 0.4.0
	 * @var string
	 */
	const EXAMPLES_FIELD = 'examples';
	/**
	 * Fields saved by versions before 0.5 as top-level settings.
	 *
	 * @since 0.4.0
	 * @var string[]
	 */
	const LEGACY_FIELDS = array( 'heading', 'greeting' );
	/**
	 * Allowed widget positions.
	 *
	 * @since 0.4.0
	 * @var string[]
	 */
	const POSITIONS = array( 'bottom-left', 'bottom-right', 'top-left', 'top-right' );
	/**
	 * Widget attribute => the dictionary key of the same text (the other keys go in the `labels` attribute).
	 *
	 * @since 0.4.0
	 * @var array<string, string>
	 */
	const MAIN_KEYS = array(
		'heading'     => 'title',
		'greeting'    => 'hello',
		'placeholder' => 'ph',
		'examples'    => 'examples',
	);

	/**
	 * The widget's own dictionary, generated from its i18n.ts by `bun run build` into widget-i18n.json.
	 *
	 * Read once per request. Texts are strings, except `examples` which is a list of strings.
	 *
	 * @since 0.4.0
	 *
	 * @return array{langs: array<string, string>, strings: array<string, array<string, string|string[]>>} `langs` code => name, `strings` code => key => text.
	 */
	public static function widget_i18n() {
		static $data = null;
		if ( null === $data ) {
			$data = json_decode( (string) file_get_contents( __DIR__ . '/widget-i18n.json' ), true );
		}
		return $data;
	}

	/**
	 * Languages the widget supports.
	 *
	 * @since 0.4.0
	 *
	 * @return array<string, string> Language code => name in its own language.
	 */
	public static function languages() {
		return self::widget_i18n()['langs'];
	}

	/**
	 * Overridable fields: main attributes first, then every other text key of the English dictionary (sent as `labels`).
	 *
	 * @since 0.4.0
	 *
	 * @return array<string, string> Field => widget dictionary key.
	 */
	public static function fields() {
		$fields = self::MAIN_KEYS;
		foreach ( self::widget_i18n()['strings']['en'] as $key => $text ) {
			if ( is_string( $text ) && ! in_array( $key, self::MAIN_KEYS, true ) ) {
				$fields[ $key ] = $key;
			}
		}
		return $fields;
	}

	/**
	 * The widget's default text of a field in a language; lines of a list (examples) are joined with newlines.
	 *
	 * @since 0.4.0
	 *
	 * @param string $code  Language code.
	 * @param string $field Field name, a key of fields().
	 * @return string The default text, '' if none.
	 */
	public static function default_text( $code, $field ) {
		$text = self::widget_i18n()['strings'][ $code ][ self::fields()[ $field ] ] ?? '';
		if ( is_array( $text ) ) {
			return implode( "\n", $text );
		}
		return $text;
	}

	/**
	 * The saved settings merged over the defaults.
	 *
	 * `greeting` and `heading` are legacy (before 0.5): no longer edited, but still used as a fallback
	 * for the selected language so an old site keeps its texts after the update.
	 *
	 * @since 0.4.0
	 *
	 * @return array{key: string, agent_url: string, position: string, greeting: string, heading: string, lang: string, l10n: array<string, array<string, string>>} Settings.
	 */
	public static function get() {
		return wp_parse_args(
			get_option( self::NAME, array() ),
			array(
				'key'       => '',
				'agent_url' => PLEIADES_DEFAULT_AGENT_URL,
				'position'  => self::DEFAULT_POSITION,
				'greeting'  => '',
				'heading'   => '',
				'lang'      => self::LANG_AUTOMATIC,
				'l10n'      => array(),
			)
		);
	}

	/**
	 * Sanitizes the fields of one tab and keeps the other tabs' values (both tabs post to the same option).
	 *
	 * Callback of register_setting(). Only the posted tab is touched: the General tab is recognised by
	 * `key`, the Localization tab by `l10n` (it always posts `l10n[_tab]`, so an all-empty form still
	 * clears the texts). Without this, saving one tab would wipe the other tab's values.
	 * A key that is not a publishable key (pk_...) is dropped with a settings error.
	 *
	 * @since 0.4.0
	 *
	 * @param mixed $in Raw posted option value; anything but an array is treated as empty.
	 * @return array The full option array to store.
	 */
	public static function sanitize( $in ) {
		$posted   = is_array( $in ) ? $in : array();
		$settings = self::get();

		if ( isset( $posted['key'] ) ) {
			$settings = self::with_general_tab( $settings, $posted );
		}
		if ( isset( $posted['l10n'] ) ) {
			$settings = self::with_localization_tab( $settings, $posted );
		}
		return $settings;
	}

	/**
	 * Settings with the General tab's posted fields sanitized in.
	 *
	 * @since 0.4.0
	 *
	 * @param array $settings Settings to start from.
	 * @param array $posted   Raw posted option value that has `key`.
	 * @return array Settings with key, agent_url and position replaced.
	 */
	private static function with_general_tab( $settings, $posted ) {
		$settings['key']       = self::sanitize_key_field( $posted['key'] );
		$settings['agent_url'] = self::sanitize_agent_url( $posted['agent_url'] ?? '' );
		$settings['position']  = self::sanitize_position( $posted['position'] ?? '' );
		return $settings;
	}

	/**
	 * A publishable key; anything else is dropped with a settings error.
	 *
	 * @since 0.4.0
	 *
	 * @param mixed $raw_key Posted key.
	 * @return string The trimmed key, or '' when empty or not a publishable key.
	 */
	private static function sanitize_key_field( $raw_key ) {
		$key = trim( sanitize_text_field( $raw_key ) );
		if ( '' === $key || preg_match( self::KEY_PATTERN, $key ) ) {
			return $key;
		}
		add_settings_error( self::NAME, 'bad_key', __( 'The key must be a publishable key (starts with pk_). Never paste a secret key.', 'pleiades-chat' ) );
		return '';
	}

	/**
	 * An http(s) agent URL without a trailing slash; the hosted service when empty or invalid.
	 *
	 * @since 0.4.0
	 *
	 * @param mixed $raw_url Posted URL.
	 * @return string URL.
	 */
	private static function sanitize_agent_url( $raw_url ) {
		$url = esc_url_raw( trim( $raw_url ), array( 'http', 'https' ) );
		if ( '' === $url ) {
			return PLEIADES_DEFAULT_AGENT_URL;
		}
		return untrailingslashit( $url );
	}

	/**
	 * One of POSITIONS, or the default.
	 *
	 * @since 0.4.0
	 *
	 * @param mixed $raw_position Posted position.
	 * @return string Position.
	 */
	private static function sanitize_position( $raw_position ) {
		$position = sanitize_key( $raw_position );
		if ( in_array( $position, self::POSITIONS, true ) ) {
			return $position;
		}
		return self::DEFAULT_POSITION;
	}

	/**
	 * Settings with the Localization tab's posted fields sanitized in.
	 *
	 * @since 0.4.0
	 *
	 * @param array $settings Settings to start from.
	 * @param array $posted   Raw posted option value that has `l10n`.
	 * @return array Settings with lang and l10n replaced.
	 */
	private static function with_localization_tab( $settings, $posted ) {
		$lang = sanitize_key( $posted['lang'] ?? '' );

		$settings['lang'] = isset( self::languages()[ $lang ] ) ? $lang : self::LANG_AUTOMATIC;
		$settings['l10n'] = self::sanitize_texts( $posted['l10n'] );
		return $settings;
	}

	/**
	 * The texts of every language and field; empty ones are left out so the widget default stays.
	 *
	 * @since 0.4.0
	 *
	 * @param mixed $posted_texts Posted `l10n` value: language => field => text.
	 * @return array<string, array<string, string>> Language => field => trimmed text.
	 */
	private static function sanitize_texts( $posted_texts ) {
		$texts = array();
		foreach ( array_keys( self::languages() ) as $code ) {
			foreach ( array_keys( self::fields() ) as $field ) {
				$text = self::sanitize_text( $field, $posted_texts[ $code ][ $field ] ?? '' );
				if ( '' !== $text ) {
					$texts[ $code ][ $field ] = $text;
				}
			}
		}
		return $texts;
	}

	/**
	 * One text: a single line, or several lines for the examples list.
	 *
	 * @since 0.4.0
	 *
	 * @param string $field    Field name.
	 * @param mixed  $raw_text Posted text; anything but a string counts as empty.
	 * @return string Trimmed text.
	 */
	private static function sanitize_text( $field, $raw_text ) {
		$raw_text = is_string( $raw_text ) ? $raw_text : '';
		if ( self::EXAMPLES_FIELD === $field ) {
			return trim( sanitize_textarea_field( $raw_text ) );
		}
		return trim( sanitize_text_field( $raw_text ) );
	}

	/**
	 * Widget attributes for the active language.
	 *
	 * The legacy heading/greeting fill in where the language has no own value. `examples` become
	 * a JSON array (one per line), the texts that have no attribute of their own become the JSON
	 * `labels` object. Empty fields are skipped, so the widget default stays.
	 *
	 * @since 0.4.0
	 *
	 * @param array $s Settings as returned by get().
	 * @return array<string, string> Attribute name => value.
	 */
	public static function widget_overrides( $s ) {
		$attributes = array();
		$labels     = array();
		foreach ( array_keys( self::fields() ) as $field ) {
			$text = self::override_text( $s, $field );
			if ( '' === $text ) {
				continue;
			}
			if ( self::EXAMPLES_FIELD === $field ) {
				$attributes[ $field ] = self::examples_json( $text );
			} elseif ( isset( self::MAIN_KEYS[ $field ] ) ) {
				$attributes[ $field ] = $text;
			} else {
				$labels[ $field ] = $text;
			}
		}
		if ( $labels ) {
			$attributes['labels'] = wp_json_encode( $labels, JSON_UNESCAPED_UNICODE );
		}
		return $attributes;
	}

	/**
	 * The text to print for a field: the selected language's own, else the legacy top-level one.
	 *
	 * @since 0.4.0
	 *
	 * @param array  $s     Settings as returned by get().
	 * @param string $field Field name.
	 * @return string The text, '' when there is none (blank counts as none).
	 */
	private static function override_text( $s, $field ) {
		$own_texts = $s['l10n'][ $s['lang'] ] ?? array();
		$legacy    = in_array( $field, self::LEGACY_FIELDS, true ) ? $s[ $field ] : '';
		$text      = $own_texts[ $field ] ?? $legacy;
		if ( ! is_string( $text ) || '' === trim( $text ) ) {
			return '';
		}
		return $text;
	}

	/**
	 * Lines of a textarea as a JSON array, blank lines dropped.
	 *
	 * @since 0.4.0
	 *
	 * @param string $text Text with one entry per line.
	 * @return string JSON array of strings.
	 */
	private static function examples_json( $text ) {
		$lines = array_filter( array_map( 'trim', preg_split( '/\R/', $text ) ) );
		return wp_json_encode( array_values( $lines ) );
	}
}
