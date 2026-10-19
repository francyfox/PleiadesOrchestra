CREATE TABLE `agent_settings` (
	`agent_id` text PRIMARY KEY NOT NULL,
	`source` text,
	`base_url` text,
	`model` text,
	`provider_key` text,
	`parameters` text DEFAULT '{}' NOT NULL,
	`updated_by` text NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`provider_key`) REFERENCES `provider_keys`(`name`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE TABLE `provider_keys` (
	`name` text PRIMARY KEY NOT NULL,
	`encrypted_key` text NOT NULL,
	`updated_by` text NOT NULL,
	`updated_at` integer NOT NULL
);
