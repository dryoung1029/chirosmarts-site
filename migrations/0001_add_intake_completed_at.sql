PRAGMA foreign_keys=OFF;--> statement-breakpoint
CREATE TABLE `__new_users` (
	`id` text PRIMARY KEY NOT NULL,
	`email` text NOT NULL,
	`legal_name` text DEFAULT '' NOT NULL,
	`display_name` text,
	`phone` text,
	`birth_month` integer,
	`clinic_name` text,
	`supervising_dc_name` text,
	`supervising_dc_license` text,
	`supervising_dc_email` text,
	`role` text DEFAULT 'student' NOT NULL,
	`marketing_consent` integer DEFAULT false NOT NULL,
	`marketing_consent_at` text,
	`intake_completed_at` text,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')) NOT NULL,
	`updated_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')) NOT NULL
);
--> statement-breakpoint
INSERT INTO `__new_users`("id", "email", "legal_name", "display_name", "phone", "birth_month", "clinic_name", "supervising_dc_name", "supervising_dc_license", "supervising_dc_email", "role", "marketing_consent", "marketing_consent_at", "intake_completed_at", "created_at", "updated_at") SELECT "id", "email", "legal_name", "display_name", "phone", "birth_month", "clinic_name", "supervising_dc_name", "supervising_dc_license", "supervising_dc_email", "role", "marketing_consent", "marketing_consent_at", "intake_completed_at", "created_at", "updated_at" FROM `users`;--> statement-breakpoint
DROP TABLE `users`;--> statement-breakpoint
ALTER TABLE `__new_users` RENAME TO `users`;--> statement-breakpoint
PRAGMA foreign_keys=ON;--> statement-breakpoint
CREATE UNIQUE INDEX `users_email_unique` ON `users` (`email`);