ALTER TABLE `intent_examples` ADD `approved_by` text;--> statement-breakpoint
ALTER TABLE `intent_examples` ADD `confidence` real;--> statement-breakpoint
ALTER TABLE `llm_calls` ADD `confidence` real;