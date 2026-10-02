ALTER TABLE `plan_runs` ADD `root_run_id` text;--> statement-breakpoint
ALTER TABLE `plan_runs` ADD `prompt` text;--> statement-breakpoint
CREATE INDEX `plan_runs_root_idx` ON `plan_runs` (`root_run_id`);--> statement-breakpoint
UPDATE `plan_runs` SET `root_run_id` = `id` WHERE `root_run_id` IS NULL;
