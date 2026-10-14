CREATE TABLE `channel_persona` (
	`channel_id` text PRIMARY KEY NOT NULL,
	`bot_name` text DEFAULT '' NOT NULL,
	`tone` text DEFAULT '' NOT NULL,
	`default_lang` text DEFAULT '' NOT NULL,
	`greeting` text DEFAULT '' NOT NULL,
	`forbidden_topics` text DEFAULT '[]' NOT NULL,
	`handoff_contact` text DEFAULT '' NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`channel_id`) REFERENCES `channels`(`id`) ON UPDATE no action ON DELETE cascade
);
