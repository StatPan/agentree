CREATE TABLE `project_new` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`directory_key` text,
	`user_created` integer DEFAULT 0 NOT NULL,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now')) NOT NULL,
	CONSTRAINT `project_new_directory_key_unique` UNIQUE(`directory_key`)
);
--> statement-breakpoint
INSERT INTO `project_new` (`id`, `name`, `directory_key`, `user_created`, `created_at`)
  SELECT `id`, `name`, `directory_key`, 0, `created_at` FROM `project`;
--> statement-breakpoint
DROP TABLE `project`;
--> statement-breakpoint
ALTER TABLE `project_new` RENAME TO `project`;
