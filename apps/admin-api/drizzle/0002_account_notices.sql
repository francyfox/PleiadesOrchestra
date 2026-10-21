CREATE TABLE `account_notices` (
	`account_id` text NOT NULL,
	`kind` text NOT NULL,
	`period` text NOT NULL,
	`sent_at` integer NOT NULL,
	PRIMARY KEY(`account_id`, `kind`, `period`),
	FOREIGN KEY (`account_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade
);
