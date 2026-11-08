<?php
// Removes only our option. Recipes (pleiades_recipe posts) and kit meta stay: they are the site owner's content.
defined( 'WP_UNINSTALL_PLUGIN' ) || exit;

delete_option( 'pleiades_assistant' );
