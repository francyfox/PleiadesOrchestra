CREATE TABLE `intent_examples` (
	`id` text PRIMARY KEY NOT NULL,
	`channel_id` text NOT NULL,
	`text_key` text NOT NULL,
	`sample` text NOT NULL,
	`intent` text NOT NULL,
	`source` text NOT NULL,
	`status` text NOT NULL,
	`plan_run_id` text,
	`seen_count` integer DEFAULT 1 NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`channel_id`) REFERENCES `channels`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`plan_run_id`) REFERENCES `plan_runs`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE UNIQUE INDEX `intent_examples_key_idx` ON `intent_examples` (`channel_id`,`text_key`);--> statement-breakpoint
CREATE INDEX `intent_examples_status_idx` ON `intent_examples` (`status`,`updated_at`);