CREATE TABLE `clinic_members` (
	`id` text PRIMARY KEY NOT NULL,
	`clinic_id` text NOT NULL,
	`user_id` text,
	`email` text NOT NULL,
	`role` text NOT NULL,
	`status` text DEFAULT 'invited' NOT NULL,
	`invite_token_hash` text,
	`invite_expires_at` text,
	`invited_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')) NOT NULL,
	`claimed_at` text,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')) NOT NULL,
	FOREIGN KEY (`clinic_id`) REFERENCES `clinics`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `clinic_members_clinic_idx` ON `clinic_members` (`clinic_id`);--> statement-breakpoint
CREATE INDEX `clinic_members_user_idx` ON `clinic_members` (`user_id`);--> statement-breakpoint
CREATE INDEX `clinic_members_email_idx` ON `clinic_members` (`email`);--> statement-breakpoint
CREATE UNIQUE INDEX `clinic_members_invite_token_idx` ON `clinic_members` (`invite_token_hash`);--> statement-breakpoint
CREATE TABLE `clinics` (
	`id` text PRIMARY KEY NOT NULL,
	`owner_user_id` text NOT NULL,
	`name` text NOT NULL,
	`seats_purchased` integer DEFAULT 0 NOT NULL,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')) NOT NULL,
	`updated_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')) NOT NULL,
	FOREIGN KEY (`owner_user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `clinics_owner_idx` ON `clinics` (`owner_user_id`);