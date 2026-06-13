ALTER TABLE `lessons` ADD `is_preview` integer DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE `lessons` ADD `preview_seconds` integer DEFAULT 300 NOT NULL;