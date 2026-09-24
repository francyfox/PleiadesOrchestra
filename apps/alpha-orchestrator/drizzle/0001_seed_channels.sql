-- Built-in channels. Web channels (shops) are created through the admin API.
INSERT INTO `channels` (`id`, `slug`, `kind`, `name`, `access_mode`, `allowed_origins`, `created_at`)
VALUES ('ch_telegram', 'telegram', 'telegram', 'Telegram', 'whitelist', '[]', CAST(strftime('%s', 'now') AS INTEGER) * 1000);
--> statement-breakpoint
INSERT INTO `channels` (`id`, `slug`, `kind`, `name`, `access_mode`, `allowed_origins`, `created_at`)
VALUES ('ch_cli', 'cli', 'cli', 'CLI', 'open', '[]', CAST(strftime('%s', 'now') AS INTEGER) * 1000);
