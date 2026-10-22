WP := docker compose -f compose.wp.yml

.PHONY: up down logs ps wp-build wp-up wp-down wp-setup wp-logs

# Main stack (compose.yml). One service: make up s=alpha-orchestrator
up:
	docker compose up -d --build $(s)

down:
	docker compose down

logs:
	docker compose logs -f $(s)

ps:
	docker compose ps; $(WP) ps

# WordPress + WooCommerce for the plugin (compose.wp.yml), http://localhost:8088 (admin/admin)
wp-build:
	bun run --cwd packages/pleiades-widget build
	bun run --cwd packages/wordpress-plugin build

wp-up: wp-build
	$(WP) up -d

wp-down:
	$(WP) down

wp-setup:
	$(WP) up wordpress-setup

wp-logs:
	$(WP) logs -f $(s)
