CREATE TABLE `billing_webhooks` (
	`id` text PRIMARY KEY NOT NULL,
	`type` text NOT NULL,
	`received_at` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `subscriptions` (
	`id` text PRIMARY KEY NOT NULL,
	`customer_id` text NOT NULL,
	`customer_email` text,
	`product_id` text,
	`product_name` text,
	`status` text NOT NULL,
	`started_at` integer,
	`current_period_start` integer,
	`current_period_end` integer,
	`cancel_at_period_end` integer NOT NULL,
	`ended_at` integer,
	`polar_modified_at` integer,
	`channel_id` text,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`channel_id`) REFERENCES `channels`(`id`) ON UPDATE no action ON DELETE set null
);
