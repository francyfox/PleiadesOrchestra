ALTER TABLE `channels` ADD `owner_id` text;--> statement-breakpoint
CREATE INDEX `channels_owner_idx` ON `channels` (`owner_id`);