CREATE TABLE `answer_options` (
	`id` text PRIMARY KEY NOT NULL,
	`question_id` text NOT NULL,
	`position` integer NOT NULL,
	`text` text NOT NULL,
	`is_correct` integer DEFAULT false NOT NULL,
	FOREIGN KEY (`question_id`) REFERENCES `questions`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `answer_options_question_idx` ON `answer_options` (`question_id`,`position`);--> statement-breakpoint
CREATE TABLE `certificates` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`course_id` text NOT NULL,
	`verification_code` text NOT NULL,
	`legal_name_snapshot` text NOT NULL,
	`course_title_snapshot` text NOT NULL,
	`credit_hours_snapshot` real NOT NULL,
	`instructor_snapshot` text NOT NULL,
	`issued_at` text NOT NULL,
	`r2_key` text,
	`status` text DEFAULT 'issued' NOT NULL,
	`supersedes_id` text,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')) NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`course_id`) REFERENCES `courses`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `certificates_verification_code_unique` ON `certificates` (`verification_code`);--> statement-breakpoint
CREATE INDEX `certificates_user_idx` ON `certificates` (`user_id`);--> statement-breakpoint
CREATE TABLE `courses` (
	`id` text PRIMARY KEY NOT NULL,
	`slug` text NOT NULL,
	`title` text NOT NULL,
	`description` text,
	`credit_hours` real DEFAULT 0 NOT NULL,
	`topic_category` text DEFAULT 'general' NOT NULL,
	`state` text DEFAULT 'oregon' NOT NULL,
	`audience` text DEFAULT 'ca' NOT NULL,
	`content_type` text DEFAULT 'ce_course' NOT NULL,
	`access_model` text DEFAULT 'one_time_purchase' NOT NULL,
	`price_cents` integer DEFAULT 14900 NOT NULL,
	`stripe_price_id` text,
	`status` text DEFAULT 'draft' NOT NULL,
	`pass_threshold` real DEFAULT 0.8 NOT NULL,
	`max_playback_rate` real DEFAULT 1.5 NOT NULL,
	`instructor_name` text DEFAULT 'Jason Young, DC' NOT NULL,
	`certifying_body_line` text,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')) NOT NULL,
	`updated_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')) NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `courses_slug_unique` ON `courses` (`slug`);--> statement-breakpoint
CREATE TABLE `documents` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`type` text DEFAULT 'other' NOT NULL,
	`title` text NOT NULL,
	`r2_key` text NOT NULL,
	`verified_by` text,
	`notes` text,
	`uploaded_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')) NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `documents_user_idx` ON `documents` (`user_id`);--> statement-breakpoint
CREATE TABLE `enrollments` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`course_id` text NOT NULL,
	`status` text DEFAULT 'pending' NOT NULL,
	`payment_status` text DEFAULT 'unpaid' NOT NULL,
	`stripe_checkout_session_id` text,
	`stripe_payment_intent_id` text,
	`amount_cents` integer,
	`enrolled_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')) NOT NULL,
	`activated_at` text,
	`completed_at` text,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`course_id`) REFERENCES `courses`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `enrollments_user_course_idx` ON `enrollments` (`user_id`,`course_id`);--> statement-breakpoint
CREATE TABLE `events` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text,
	`type` text NOT NULL,
	`course_id` text,
	`lesson_id` text,
	`quiz_id` text,
	`occurred_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')) NOT NULL,
	`position_start_seconds` real,
	`position_end_seconds` real,
	`wall_seconds` real,
	`playback_rate` real,
	`payload` text,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`course_id`) REFERENCES `courses`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`lesson_id`) REFERENCES `lessons`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`quiz_id`) REFERENCES `quizzes`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `events_user_idx` ON `events` (`user_id`,`occurred_at`);--> statement-breakpoint
CREATE INDEX `events_lesson_idx` ON `events` (`lesson_id`,`type`);--> statement-breakpoint
CREATE TABLE `lesson_transcripts` (
	`id` text PRIMARY KEY NOT NULL,
	`lesson_id` text NOT NULL,
	`chunk_index` integer NOT NULL,
	`start_seconds` real NOT NULL,
	`end_seconds` real NOT NULL,
	`text` text NOT NULL,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')) NOT NULL,
	FOREIGN KEY (`lesson_id`) REFERENCES `lessons`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `lesson_transcripts_lesson_idx` ON `lesson_transcripts` (`lesson_id`,`chunk_index`);--> statement-breakpoint
CREATE TABLE `lessons` (
	`id` text PRIMARY KEY NOT NULL,
	`module_id` text NOT NULL,
	`position` integer NOT NULL,
	`title` text NOT NULL,
	`stream_video_uid` text,
	`duration_seconds` integer DEFAULT 0 NOT NULL,
	`evidence_type` text DEFAULT 'playback_heartbeat' NOT NULL,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')) NOT NULL,
	FOREIGN KEY (`module_id`) REFERENCES `modules`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `lessons_module_idx` ON `lessons` (`module_id`,`position`);--> statement-breakpoint
CREATE TABLE `magic_links` (
	`id` text PRIMARY KEY NOT NULL,
	`email` text NOT NULL,
	`token_hash` text NOT NULL,
	`intent` text DEFAULT 'login' NOT NULL,
	`expires_at` text NOT NULL,
	`consumed_at` text,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')) NOT NULL
);
--> statement-breakpoint
CREATE INDEX `magic_links_email_idx` ON `magic_links` (`email`);--> statement-breakpoint
CREATE UNIQUE INDEX `magic_links_token_hash_idx` ON `magic_links` (`token_hash`);--> statement-breakpoint
CREATE TABLE `modules` (
	`id` text PRIMARY KEY NOT NULL,
	`course_id` text NOT NULL,
	`position` integer NOT NULL,
	`title` text NOT NULL,
	`description` text,
	`is_free_preview` integer DEFAULT false NOT NULL,
	FOREIGN KEY (`course_id`) REFERENCES `courses`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `modules_course_idx` ON `modules` (`course_id`,`position`);--> statement-breakpoint
CREATE TABLE `path_template_steps` (
	`id` text PRIMARY KEY NOT NULL,
	`template_id` text NOT NULL,
	`position` integer NOT NULL,
	`key` text NOT NULL,
	`title` text NOT NULL,
	`description` text,
	`step_type` text NOT NULL,
	`course_id` text,
	`gating_rule` text,
	`evidence_required` integer DEFAULT false NOT NULL,
	FOREIGN KEY (`template_id`) REFERENCES `path_templates`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`course_id`) REFERENCES `courses`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `path_template_steps_template_idx` ON `path_template_steps` (`template_id`,`position`);--> statement-breakpoint
CREATE TABLE `path_templates` (
	`id` text PRIMARY KEY NOT NULL,
	`slug` text NOT NULL,
	`name` text NOT NULL,
	`description` text,
	`state` text DEFAULT 'oregon' NOT NULL,
	`audience` text DEFAULT 'ca' NOT NULL,
	`status` text DEFAULT 'draft' NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `path_templates_slug_unique` ON `path_templates` (`slug`);--> statement-breakpoint
CREATE TABLE `playback_leases` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`lesson_id` text NOT NULL,
	`device_id` text NOT NULL,
	`acquired_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')) NOT NULL,
	`last_renewed_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')) NOT NULL,
	`expires_at` text NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`lesson_id`) REFERENCES `lessons`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `playback_leases_user_idx` ON `playback_leases` (`user_id`);--> statement-breakpoint
CREATE TABLE `questions` (
	`id` text PRIMARY KEY NOT NULL,
	`quiz_id` text NOT NULL,
	`position` integer NOT NULL,
	`prompt` text NOT NULL,
	`type` text NOT NULL,
	`explanation` text,
	FOREIGN KEY (`quiz_id`) REFERENCES `quizzes`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `questions_quiz_idx` ON `questions` (`quiz_id`,`position`);--> statement-breakpoint
CREATE TABLE `quiz_attempts` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`quiz_id` text NOT NULL,
	`attempt_number` integer NOT NULL,
	`score` real NOT NULL,
	`passed` integer NOT NULL,
	`answers` text NOT NULL,
	`started_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')) NOT NULL,
	`submitted_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')) NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`quiz_id`) REFERENCES `quizzes`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `quiz_attempts_user_quiz_idx` ON `quiz_attempts` (`user_id`,`quiz_id`);--> statement-breakpoint
CREATE TABLE `quizzes` (
	`id` text PRIMARY KEY NOT NULL,
	`course_id` text NOT NULL,
	`module_id` text,
	`kind` text NOT NULL,
	`title` text NOT NULL,
	`pass_threshold` real,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')) NOT NULL,
	FOREIGN KEY (`course_id`) REFERENCES `courses`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`module_id`) REFERENCES `modules`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `quizzes_course_idx` ON `quizzes` (`course_id`);--> statement-breakpoint
CREATE TABLE `sessions` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')) NOT NULL,
	`expires_at` text NOT NULL,
	`last_seen_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')) NOT NULL,
	`user_agent` text,
	`ip` text,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `sessions_user_idx` ON `sessions` (`user_id`);--> statement-breakpoint
CREATE TABLE `user_paths` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`template_id` text NOT NULL,
	`status` text DEFAULT 'active' NOT NULL,
	`started_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')) NOT NULL,
	`completed_at` text,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`template_id`) REFERENCES `path_templates`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `user_paths_user_idx` ON `user_paths` (`user_id`);--> statement-breakpoint
CREATE TABLE `user_steps` (
	`id` text PRIMARY KEY NOT NULL,
	`user_path_id` text NOT NULL,
	`template_step_id` text NOT NULL,
	`position` integer NOT NULL,
	`title` text NOT NULL,
	`status` text DEFAULT 'locked' NOT NULL,
	`evidence_ref` text,
	`completed_at` text,
	`updated_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')) NOT NULL,
	FOREIGN KEY (`user_path_id`) REFERENCES `user_paths`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`template_step_id`) REFERENCES `path_template_steps`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `user_steps_path_idx` ON `user_steps` (`user_path_id`,`position`);--> statement-breakpoint
CREATE TABLE `users` (
	`id` text PRIMARY KEY NOT NULL,
	`email` text NOT NULL,
	`legal_name` text NOT NULL,
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
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')) NOT NULL,
	`updated_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')) NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `users_email_unique` ON `users` (`email`);