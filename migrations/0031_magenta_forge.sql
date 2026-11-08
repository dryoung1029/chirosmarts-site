CREATE TABLE `email_suppressions` (
	`email` text PRIMARY KEY NOT NULL,
	`reason` text DEFAULT 'unsubscribed' NOT NULL,
	`source` text,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')) NOT NULL
);
--> statement-breakpoint
CREATE TABLE `rate_limits` (
	`key` text PRIMARY KEY NOT NULL,
	`window_start` integer NOT NULL,
	`count` integer DEFAULT 0 NOT NULL
);
