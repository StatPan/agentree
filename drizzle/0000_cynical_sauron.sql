CREATE TABLE `canvas_node` (
	`session_id` text PRIMARY KEY NOT NULL,
	`label` text,
	`canvas_x` real DEFAULT 0 NOT NULL,
	`canvas_y` real DEFAULT 0 NOT NULL,
	`pinned` integer DEFAULT 0 NOT NULL,
	`updated_at` text DEFAULT 'strftime(''%Y-%m-%dT%H:%M:%SZ'', ''now'')' NOT NULL
);
