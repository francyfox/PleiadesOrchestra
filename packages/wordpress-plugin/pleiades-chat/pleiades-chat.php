<?php
/**
 * Plugin Name: Pleiades Assistant
 * Plugin URI: https://pleiades.shalotts.site/
 * Description: An AI shop and site assistant (Pleiades chat widget) with WooCommerce tools for search, product cards and the cart.
 * Version: 0.5.0
 * Requires at least: 6.4
 * Requires PHP: 7.4
 * Author: Danil Golota
 * License: GPL-2.0-or-later
 * License URI: https://www.gnu.org/licenses/gpl-2.0.html
 * Text Domain: pleiades-chat
 * Domain Path: /languages
 */

/**
 * Plugin bootstrap: constants and the call to Pleiades_Plugin::init().
 *
 * @package Pleiades_Chat
 * @since   0.4.0
 */

defined( 'ABSPATH' ) || exit;

/** @var string Plugin version; part of the asset cache-busting string. Keep equal to the Version header. */
const PLEIADES_VERSION = '0.5.0';
/** @var string Absolute path of this file: base for plugin_dir_path/url, activation hook and plugin_basename. */
const PLEIADES_FILE    = __FILE__;
/** @var string Hosted agent service used when the Agent URL setting is empty. */
const PLEIADES_DEFAULT_AGENT_URL = 'https://albedo.shalotts.site';
/** @var string Project website (plugin row link). */
const PLEIADES_SITE_URL  = 'https://pleiades.shalotts.site/';
/** @var string Panel where the widget key is issued. */
const PLEIADES_PANEL_URL = 'https://pleiades-panel.shalotts.site/user/login';
/** @var string Terms of service, linked from the settings screen. */
const PLEIADES_TERMS_URL   = 'https://pleiades.shalotts.site/terms/';
/** @var string Privacy policy, linked from the settings screen. */
const PLEIADES_PRIVACY_URL = 'https://pleiades.shalotts.site/privacy/';

require_once __DIR__ . '/includes/class-pleiades-plugin.php';

Pleiades_Plugin::init();
