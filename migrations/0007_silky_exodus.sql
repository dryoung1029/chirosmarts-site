CREATE TABLE `marketing_leads` (
	`id` text PRIMARY KEY NOT NULL,
	`email` text NOT NULL,
	`source` text DEFAULT 'other' NOT NULL,
	`birth_month` integer,
	`status` text DEFAULT 'pending' NOT NULL,
	`confirm_token_hash` text,
	`consent_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')) NOT NULL,
	`confirmed_at` text,
	`synced_to_brevo_at` text,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')) NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `marketing_leads_email_source_idx` ON `marketing_leads` (`email`,`source`);--> statement-breakpoint
CREATE INDEX `marketing_leads_status_idx` ON `marketing_leads` (`status`);