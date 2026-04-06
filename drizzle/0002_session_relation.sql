CREATE TABLE `session_relation` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`from_session_id` text NOT NULL,
	`to_session_id` text NOT NULL,
	`relation_type` text NOT NULL,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now')) NOT NULL
);
