CREATE TABLE `course_resources` (
	`id` text PRIMARY KEY NOT NULL,
	`course_id` text NOT NULL,
	`type` text DEFAULT 'other' NOT NULL,
	`title` text NOT NULL,
	`file_name` text NOT NULL,
	`content_type` text DEFAULT 'application/pdf' NOT NULL,
	`r2_key` text NOT NULL,
	`visibility` text DEFAULT 'enrolled' NOT NULL,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')) NOT NULL,
	FOREIGN KEY (`course_id`) REFERENCES `courses`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `course_resources_course_idx` ON `course_resources` (`course_id`);