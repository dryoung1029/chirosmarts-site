CREATE TABLE `amplify_kits` (
	`post_id` text PRIMARY KEY NOT NULL,
	`kit` text NOT NULL,
	`newsletter` text,
	`model` text,
	`updated_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')) NOT NULL
);
