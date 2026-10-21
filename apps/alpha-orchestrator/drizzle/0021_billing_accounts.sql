CREATE TABLE `credit_ledger` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`account_id` text NOT NULL,
	`amount` integer NOT NULL,
	`reason` text NOT NULL,
	`ref` text NOT NULL,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `credit_ledger_account_idx` ON `credit_ledger` (`account_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `credit_ledger_top_up_once` ON `credit_ledger` (`ref`) WHERE "credit_ledger"."reason" = 'top_up';--> statement-breakpoint
CREATE TABLE `orders` (
	`id` text PRIMARY KEY NOT NULL,
	`account_id` text NOT NULL,
	`product_id` text,
	`kind` text NOT NULL,
	`amount` integer NOT NULL,
	`currency` text NOT NULL,
	`status` text NOT NULL,
	`created_at` integer NOT NULL,
	`refunded_amount` integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
PRAGMA foreign_keys=OFF;--> statement-breakpoint
CREATE TABLE `__new_subscriptions` (
	`id` text PRIMARY KEY NOT NULL,
	`customer_id` text NOT NULL,
	`customer_email` text,
	`product_id` text,
	`product_name` text,
	`status` text NOT NULL,
	`started_at` integer,
	`current_period_start` integer,
	`current_period_end` integer,
	`cancel_at_period_end` integer NOT NULL,
	`ended_at` integer,
	`polar_modified_at` integer,
	`account_id` text NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
-- Old rows have no account to map to (the hand-made channel link goes away): relink by the next Polar webhook.
DROP TABLE `subscriptions`;--> statement-breakpoint
ALTER TABLE `__new_subscriptions` RENAME TO `subscriptions`;--> statement-breakpoint
PRAGMA foreign_keys=ON;