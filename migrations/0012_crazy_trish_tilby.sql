CREATE TABLE `course_collateral` (
	`id` text PRIMARY KEY NOT NULL,
	`course_id` text NOT NULL,
	`scope` text DEFAULT 'course' NOT NULL,
	`scope_ref_id` text,
	`type` text NOT NULL,
	`title` text NOT NULL,
	`status` text DEFAULT 'draft' NOT NULL,
	`body_markdown` text DEFAULT '' NOT NULL,
	`model` text,
	`source_meta` text,
	`r2_key` text,
	`resource_id` text,
	`version` integer DEFAULT 0 NOT NULL,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')) NOT NULL,
	`updated_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')) NOT NULL,
	`published_at` text,
	FOREIGN KEY (`course_id`) REFERENCES `courses`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`resource_id`) REFERENCES `course_resources`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `course_collateral_course_idx` ON `course_collateral` (`course_id`);--> statement-breakpoint
CREATE INDEX `course_collateral_status_idx` ON `course_collateral` (`status`);