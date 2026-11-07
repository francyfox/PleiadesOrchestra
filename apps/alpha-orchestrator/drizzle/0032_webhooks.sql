CREATE TABLE `webhooks` (
	`id` text PRIMARY KEY NOT NULL,
	`url` text NOT NULL,
	`secret` text NOT NULL,
	`owner_id` text,
	`events` text NOT NULL,
	`enabled` integer NOT NULL,
	`last_status` integer,
	`last_error` text,
	`last_at` integer,
	`created_at` integer NOT NULL
);
