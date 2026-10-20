ALTER TABLE `user` ADD `level` integer DEFAULT 200 NOT NULL;--> statement-breakpoint
ALTER TABLE `user` ADD `last_active_at` integer;--> statement-breakpoint
ALTER TABLE `user` ADD `token_hash` text;--> statement-breakpoint
ALTER TABLE `user` ADD `locale` text;--> statement-breakpoint
UPDATE `user` SET `level` = 100;--> statement-breakpoint
UPDATE `user` SET `level` = 0 WHERE `id` = (SELECT `id` FROM `user` ORDER BY `created_at`, `id` LIMIT 1);--> statement-breakpoint
DELETE FROM `account` WHERE `provider_id` = 'credential';
