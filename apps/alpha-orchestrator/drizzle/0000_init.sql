CREATE TABLE `blocked_ips` (
	`id` text PRIMARY KEY NOT NULL,
	`ip_hash` text NOT NULL,
	`channel_id` text,
	`reason` text NOT NULL,
	`created_at` integer NOT NULL,
	`expires_at` integer NOT NULL,
	FOREIGN KEY (`channel_id`) REFERENCES `channels`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `blocked_ips_hash_idx` ON `blocked_ips` (`ip_hash`);--> statement-breakpoint
CREATE TABLE `channels` (
	`id` text PRIMARY KEY NOT NULL,
	`slug` text NOT NULL,
	`kind` text NOT NULL,
	`name` text NOT NULL,
	`access_mode` text NOT NULL,
	`publishable_key` text,
	`secret_key_hash` text,
	`allowed_origins` text DEFAULT '[]' NOT NULL,
	`disabled_at` integer,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `channels_slug_unique` ON `channels` (`slug`);--> statement-breakpoint
CREATE UNIQUE INDEX `channels_publishable_key_unique` ON `channels` (`publishable_key`);--> statement-breakpoint
CREATE TABLE `llm_calls` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`at` integer NOT NULL,
	`user_id` text,
	`channel_id` text,
	`thread_id` text,
	`plan_run_id` text,
	`action_name` text,
	`kind` text NOT NULL,
	`provider` text NOT NULL,
	`model` text NOT NULL,
	`input_tokens` integer,
	`output_tokens` integer,
	`latency_ms` integer NOT NULL,
	`ok` integer NOT NULL,
	`error` text,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`channel_id`) REFERENCES `channels`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`thread_id`) REFERENCES `threads`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`plan_run_id`) REFERENCES `plan_runs`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `llm_calls_user_at_idx` ON `llm_calls` (`user_id`,`at`);--> statement-breakpoint
CREATE INDEX `llm_calls_channel_at_idx` ON `llm_calls` (`channel_id`,`at`);--> statement-breakpoint
CREATE INDEX `llm_calls_run_idx` ON `llm_calls` (`plan_run_id`);--> statement-breakpoint
CREATE INDEX `llm_calls_at_idx` ON `llm_calls` (`at`);--> statement-breakpoint
CREATE TABLE `messages` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`thread_id` text NOT NULL,
	`user_id` text NOT NULL,
	`role` text NOT NULL,
	`content` text NOT NULL,
	`created_at` integer NOT NULL,
	`plan_run_id` text,
	FOREIGN KEY (`thread_id`) REFERENCES `threads`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`plan_run_id`) REFERENCES `plan_runs`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `messages_user_idx` ON `messages` (`user_id`,`id`);--> statement-breakpoint
CREATE INDEX `messages_thread_idx` ON `messages` (`thread_id`,`id`);--> statement-breakpoint
CREATE TABLE `plan_events` (
	`run_id` text NOT NULL,
	`seq` integer NOT NULL,
	`type` text NOT NULL,
	`attempt` integer NOT NULL,
	`action` text,
	`payload` text NOT NULL,
	`at` integer NOT NULL,
	PRIMARY KEY(`run_id`, `seq`),
	FOREIGN KEY (`run_id`) REFERENCES `plan_runs`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `plan_runs` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`thread_id` text NOT NULL,
	`goal` text NOT NULL,
	`succeeded` integer NOT NULL,
	`attempts` integer NOT NULL,
	`duration_ms` integer NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`thread_id`) REFERENCES `threads`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `plan_runs_user_idx` ON `plan_runs` (`user_id`,`created_at`);--> statement-breakpoint
CREATE TABLE `threads` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`channel_id` text NOT NULL,
	`external_thread_id` text,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`channel_id`) REFERENCES `channels`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `threads_channel_user_external_uq` ON `threads` (`channel_id`,`user_id`,`external_thread_id`);--> statement-breakpoint
CREATE INDEX `threads_external_idx` ON `threads` (`external_thread_id`);--> statement-breakpoint
CREATE TABLE `users` (
	`id` text PRIMARY KEY NOT NULL,
	`channel_id` text NOT NULL,
	`external_user_id` text,
	`kind` text NOT NULL,
	`display_name` text,
	`created_at` integer NOT NULL,
	`last_seen_at` integer NOT NULL,
	`whitelisted_at` integer,
	`whitelisted_by` text,
	`blocked_at` integer,
	`blocked_reason` text,
	`blocked_by` text,
	`merged_into` text,
	FOREIGN KEY (`channel_id`) REFERENCES `channels`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `users_channel_external_uq` ON `users` (`channel_id`,`external_user_id`);--> statement-breakpoint
CREATE INDEX `users_last_seen_idx` ON `users` (`last_seen_at`);--> statement-breakpoint
CREATE INDEX `users_kind_last_seen_idx` ON `users` (`kind`,`last_seen_at`);--> statement-breakpoint
CREATE TABLE `visitor_tokens` (
	`token_hash` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`channel_id` text NOT NULL,
	`created_at` integer NOT NULL,
	`last_used_at` integer NOT NULL,
	`expires_at` integer NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`channel_id`) REFERENCES `channels`(`id`) ON UPDATE no action ON DELETE cascade
);
