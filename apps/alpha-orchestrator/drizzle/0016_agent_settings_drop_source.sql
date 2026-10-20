PRAGMA foreign_keys=OFF;--> statement-breakpoint
CREATE TABLE `__new_agent_settings` (
	`agent_id` text PRIMARY KEY NOT NULL,
	`model` text,
	`parameters` text DEFAULT '{}' NOT NULL,
	`updated_by` text NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
INSERT INTO `__new_agent_settings`("agent_id", "model", "parameters", "updated_by", "updated_at") SELECT "agent_id", "model", "parameters", "updated_by", "updated_at" FROM `agent_settings`;--> statement-breakpoint
DROP TABLE `agent_settings`;--> statement-breakpoint
ALTER TABLE `__new_agent_settings` RENAME TO `agent_settings`;--> statement-breakpoint
PRAGMA foreign_keys=ON;