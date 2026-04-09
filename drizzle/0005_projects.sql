CREATE TABLE `project` (
	`id` text NOT NULL PRIMARY KEY,
	`name` text NOT NULL,
	`directory_key` text NOT NULL UNIQUE,
	`created_at` text NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now'))
);
--> statement-breakpoint
ALTER TABLE `canvas_node` ADD `project_id` text REFERENCES project(id);
