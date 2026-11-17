<?php
/**
 * Per-call limits of the cart tools, in units (not requests).
 *
 * @package Pleiades_Chat
 * @since   0.4.0
 */

defined( 'ABSPATH' ) || exit;

/**
 * The single source of the limits; `tools-core.js` enforces them (it only repeats these numbers as a fallback).
 *
 * A hallucinating small model, or a prompt injected through shop content, can ask for a huge cart in
 * one turn, and the orchestrator's rate limit counts requests, not units. A call over a limit is
 * refused with the code LIMIT_EXCEEDED (never silently clamped), so the visitor hears about it.
 *
 * @since 0.5.0
 */
final class Pleiades_Limits {

	/**
	 * Defaults. Sized for a household shop: 20 of one product covers a party, 99 is the usual cart-line
	 * ceiling, 12 servings a big dinner, 100 units one basket of a recipe or kit.
	 *
	 * @since 0.5.0
	 * @var int[]
	 */
	const DEFAULTS = array(
		'addQuantity'  => 20,
		'cartQuantity' => 99,
		'servings'     => 12,
		'callUnits'    => 100,
	);

	/**
	 * The limits printed as `window.PleiadesWp.limits`.
	 *
	 * @since 0.5.0
	 *
	 * @return int[] Map of limit name to a positive integer.
	 */
	public static function get() {
		/**
		 * Filters the per-call limits of the assistant's cart tools.
		 *
		 * Keys: `addQuantity` (units per add_to_cart call), `cartQuantity` (quantity a cart line may be
		 * set to; 0 still removes), `servings` (servings per add_recipe_to_cart call), `callUnits`
		 * (total units one tool call may add, recipes and kits summed). Values below 1 or not numeric
		 * fall back to the default.
		 *
		 * @since 0.5.0
		 *
		 * @param int[] $limits Map of limit name to maximum.
		 */
		$filtered = apply_filters( 'pleiades_chat_limits', self::DEFAULTS );
		$filtered = is_array( $filtered ) ? $filtered : array();
		$limits   = array();
		foreach ( self::DEFAULTS as $key => $default ) {
			$value          = isset( $filtered[ $key ] ) ? (int) $filtered[ $key ] : 0;
			$limits[ $key ] = $value >= 1 ? $value : $default;
		}
		return $limits;
	}
}
