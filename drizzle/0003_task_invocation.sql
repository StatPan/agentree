CREATE TABLE `task_invocation` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`parent_session_id` text NOT NULL,
	`message_id` text,
	`part_id` text,
	`child_session_id` text,
	`agent` text NOT NULL,
	`description` text NOT NULL,
	`prompt_preview` text NOT NULL,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now')) NOT NULL,
	`updated_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now')) NOT NULL
);
