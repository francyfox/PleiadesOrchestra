CREATE TABLE `local_model_prices` (
	`model` text PRIMARY KEY NOT NULL,
	`input_per_million_usd` real NOT NULL,
	`output_per_million_usd` real NOT NULL,
	`cache_read_per_million_usd` real
);
--> statement-breakpoint
ALTER TABLE `llm_calls` ADD `cache_read_tokens` integer;