CREATE TABLE `support_requests` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text,
	`email` text NOT NULL,
	`subject` text NOT NULL,
	`message` text NOT NULL,
	`from_page` text,
	`status` text DEFAULT 'new' NOT NULL,
	`category` text,
	`confidence` real,
	`auto_sendable` integer DEFAULT false NOT NULL,
	`escalation_reason` text,
	`draft_subject` text,
	`draft_body` text,
	`help_articles` text,
	`model` text,
	`sent_at` text,
	`sent_by` text,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')) NOT NULL,
	`updated_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')) NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `support_requests_status_idx` ON `support_requests` (`status`,`created_at`);--> statement-breakpoint
CREATE INDEX `support_requests_email_idx` ON `support_requests` (`email`);