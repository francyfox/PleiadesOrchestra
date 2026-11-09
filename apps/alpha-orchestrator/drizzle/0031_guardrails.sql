CREATE TABLE `guardrail_settings` (
	`id` integer PRIMARY KEY NOT NULL,
	`enabled` integer NOT NULL,
	`rules` text NOT NULL,
	`updated_by` text NOT NULL,
	`updated_at` integer NOT NULL
);
