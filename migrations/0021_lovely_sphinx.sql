CREATE TABLE `imported_contacts` (
	`id` text PRIMARY KEY NOT NULL,
	`email` text NOT NULL,
	`first_name` text,
	`last_name` text,
	`clinic` text,
	`phone` text,
	`address_street` text,
	`address_city` text,
	`address_state` text,
	`address_zip` text,
	`birth_month` integer,
	`first_source` text,
	`ever_bought` integer DEFAULT false NOT NULL,
	`first_seen_at` text,
	`last_seen_at` text,
	`imported_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')) NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `imported_contacts_email_idx` ON `imported_contacts` (`email`);