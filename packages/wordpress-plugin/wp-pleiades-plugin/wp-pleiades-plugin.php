<?php
/**
 * Plugin Name: Pleiades Assistant
 * Plugin URI: https://pleiades.shalotts.site/
 * Description: An AI shop and site assistant (Pleiades chat widget) with WooCommerce tools for search, product cards and the cart.
 * Version: 0.4.0
 * Requires at least: 6.4
 * Requires PHP: 7.4
 * Author: Danil Golota
 * License: GPL-2.0-or-later
 * License URI: https://www.gnu.org/licenses/gpl-2.0.html
 * Text Domain: wp-pleiades-plugin
 * Domain Path: /languages
 */

defined( 'ABSPATH' ) || exit;

const PLEIADES_VERSION = '0.4.0';
const PLEIADES_FILE    = __FILE__;
// Placeholder: the hosted orchestrator is not published yet. Replace before release.
const PLEIADES_DEFAULT_AGENT_URL = 'https://agent.pleiades.shalotts.site';
// The only place for the project links (settings page, plugin row, readme.txt repeats them).
const PLEIADES_SITE_URL  = 'https://pleiades.shalotts.site/';
const PLEIADES_PANEL_URL = 'https://pleiades-panel.shalotts.site/user/login';

require_once __DIR__ . '/includes/class-pleiades-plugin.php';

Pleiades_Plugin::init();
