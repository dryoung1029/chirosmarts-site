ALTER TABLE `questions` ADD `source_lesson_id` text REFERENCES lessons(id);--> statement-breakpoint
ALTER TABLE `questions` ADD `source_start_seconds` integer;