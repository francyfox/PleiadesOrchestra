<?php
/**
 * Uninstall handler: removes only the plugin option.
 *
 * Recipes (pleiades_recipe posts) and kit meta stay: they are the site owner's content.
 * WP_UNINSTALL_PLUGIN is defined by WordPress only while it deletes the plugin, so a direct request exits.
 *
 * @package Pleiades_Chat
 * @since   0.4.0
 */

defined( 'WP_UNINSTALL_PLUGIN' ) || exit;

delete_option( 'pleiades_assistant' );
delete_transient( 'pleiades_bundles_pleiades_recipe' );
delete_transient( 'pleiades_bundles_product' );
