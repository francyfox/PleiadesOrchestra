ALTER TABLE `users` RENAME TO `visitors`;--> statement-breakpoint
ALTER TABLE `visitors` ADD `name` text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE `llm_calls` RENAME COLUMN `user_id` TO `visitor_id`;--> statement-breakpoint
ALTER TABLE `messages` RENAME COLUMN `user_id` TO `visitor_id`;--> statement-breakpoint
ALTER TABLE `plan_runs` RENAME COLUMN `user_id` TO `visitor_id`;--> statement-breakpoint
ALTER TABLE `threads` RENAME COLUMN `user_id` TO `visitor_id`;--> statement-breakpoint
ALTER TABLE `visitor_tokens` RENAME COLUMN `user_id` TO `visitor_id`;--> statement-breakpoint
DROP INDEX `users_channel_external_uq`;--> statement-breakpoint
DROP INDEX `users_last_seen_idx`;--> statement-breakpoint
DROP INDEX `users_kind_last_seen_idx`;--> statement-breakpoint
DROP INDEX `llm_calls_user_at_idx`;--> statement-breakpoint
DROP INDEX `messages_user_idx`;--> statement-breakpoint
DROP INDEX `plan_runs_user_idx`;--> statement-breakpoint
DROP INDEX `threads_channel_user_external_uq`;--> statement-breakpoint
CREATE UNIQUE INDEX `visitors_channel_external_uq` ON `visitors` (`channel_id`,`external_user_id`);--> statement-breakpoint
CREATE INDEX `visitors_last_seen_idx` ON `visitors` (`last_seen_at`);--> statement-breakpoint
CREATE INDEX `visitors_kind_last_seen_idx` ON `visitors` (`kind`,`last_seen_at`);--> statement-breakpoint
CREATE INDEX `llm_calls_visitor_at_idx` ON `llm_calls` (`visitor_id`,`at`);--> statement-breakpoint
CREATE INDEX `messages_visitor_idx` ON `messages` (`visitor_id`,`id`);--> statement-breakpoint
CREATE INDEX `plan_runs_visitor_idx` ON `plan_runs` (`visitor_id`,`created_at`);--> statement-breakpoint
CREATE UNIQUE INDEX `threads_channel_visitor_external_uq` ON `threads` (`channel_id`,`visitor_id`,`external_thread_id`);
