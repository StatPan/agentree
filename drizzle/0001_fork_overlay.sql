CREATE TABLE `session_fork` (
	`session_id` text PRIMARY KEY NOT NULL,
	`forked_from_session_id` text NOT NULL,
	`created_at` text DEFAULT 'strftime(''%Y-%m-%dT%H:%M:%SZ'', ''now'')' NOT NULL
);
