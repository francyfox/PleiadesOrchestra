CREATE TABLE `mcp_catalogs` (
	`channel_id` text NOT NULL,
	`hash` text NOT NULL,
	`tools` text NOT NULL,
	`tool_count` integer NOT NULL,
	`first_seen_at` integer NOT NULL,
	`last_seen_at` integer NOT NULL,
	`registrations` integer NOT NULL,
	PRIMARY KEY(`channel_id`, `hash`),
	FOREIGN KEY (`channel_id`) REFERENCES `channels`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `mcp_catalogs_seen_idx` ON `mcp_catalogs` (`channel_id`,`last_seen_at`);