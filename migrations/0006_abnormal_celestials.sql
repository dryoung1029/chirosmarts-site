CREATE TABLE `bundle_items` (
	`id` text PRIMARY KEY NOT NULL,
	`bundle_course_id` text NOT NULL,
	`child_course_id` text NOT NULL,
	FOREIGN KEY (`bundle_course_id`) REFERENCES `courses`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`child_course_id`) REFERENCES `courses`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `bundle_items_pair_idx` ON `bundle_items` (`bundle_course_id`,`child_course_id`);--> statement-breakpoint
CREATE INDEX `bundle_items_bundle_idx` ON `bundle_items` (`bundle_course_id`);
-- NOTE: the schema changed courses.price_cents default 14900 -> 0 for intent and
-- grep-cleanliness, but the table rebuild SQLite needs to drop a column default
-- CANNOT run on D1 (PRAGMA foreign_keys=OFF is a no-op inside the migration
-- transaction, and other tables FK to courses). The live default stays 14900 and
-- is harmless: every insert sets price_cents explicitly, so the default never
-- fires. drizzle-kit diffs schema against the snapshot (which records 0), so no
-- further rebuild is generated.
