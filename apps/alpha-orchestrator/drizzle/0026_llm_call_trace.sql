ALTER TABLE `llm_calls` ADD `prompt` text;--> statement-breakpoint
ALTER TABLE `llm_calls` ADD `response` text;--> statement-breakpoint
ALTER TABLE `llm_calls` ADD `attempts` integer;--> statement-breakpoint
ALTER TABLE `llm_calls` ADD `failed_statuses` text;