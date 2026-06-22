CREATE TABLE `clinic_seat_pools` (
	`id` text PRIMARY KEY NOT NULL,
	`clinic_id` text NOT NULL,
	`course_id` text NOT NULL,
	`seats_purchased` integer DEFAULT 0 NOT NULL,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')) NOT NULL,
	`updated_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')) NOT NULL,
	FOREIGN KEY (`clinic_id`) REFERENCES `clinics`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`course_id`) REFERENCES `courses`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `clinic_seat_pools_clinic_course_idx` ON `clinic_seat_pools` (`clinic_id`,`course_id`);--> statement-breakpoint
CREATE TABLE `seat_assignments` (
	`id` text PRIMARY KEY NOT NULL,
	`clinic_id` text NOT NULL,
	`course_id` text NOT NULL,
	`member_id` text NOT NULL,
	`status` text DEFAULT 'invited' NOT NULL,
	`enrollment_id` text,
	`invite_token_hash` text,
	`invite_expires_at` text,
	`assigned_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')) NOT NULL,
	`claimed_at` text,
	FOREIGN KEY (`clinic_id`) REFERENCES `clinics`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`course_id`) REFERENCES `courses`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`member_id`) REFERENCES `clinic_members`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`enrollment_id`) REFERENCES `enrollments`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `seat_assignments_member_course_idx` ON `seat_assignments` (`member_id`,`course_id`);--> statement-breakpoint
CREATE INDEX `seat_assignments_pool_idx` ON `seat_assignments` (`clinic_id`,`course_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `seat_assignments_token_idx` ON `seat_assignments` (`invite_token_hash`);--> statement-breakpoint
-- ===== HAND-WRITTEN BACKFILL (Phase 4 — append after the generated DDL) =====
-- (a) Existing single CA seat pool → a per-course pool row for the CA course.
INSERT INTO `clinic_seat_pools` (id, clinic_id, course_id, seats_purchased, created_at, updated_at)
SELECT 'csp_caini_' || c.id, c.id, 'crs_or_ca_initial', c.seats_purchased,
       strftime('%Y-%m-%dT%H:%M:%fZ','now'), strftime('%Y-%m-%dT%H:%M:%fZ','now')
FROM `clinics` c
WHERE c.seats_purchased > 0;--> statement-breakpoint
-- (b) Existing CA clinic_members → a CA seat_assignment each, mapping status and
--     linking to their CA enrollment when one exists. Owners (role='owner') don't
--     consume seats and are skipped. 'removed' members map to 'revoked' (seat freed);
--     'active'/'invited' carry over. Invite token/expiry copied so pending invites
--     keep working under the new model (claim now looks the token up here).
INSERT INTO `seat_assignments`
  (id, clinic_id, course_id, member_id, status, enrollment_id, invite_token_hash, invite_expires_at, assigned_at, claimed_at)
SELECT 'sa_caini_' || m.id, m.clinic_id, 'crs_or_ca_initial', m.id,
       CASE m.status WHEN 'active' THEN 'active'
                     WHEN 'invited' THEN 'invited'
                     ELSE 'revoked' END,
       (SELECT e.id FROM `enrollments` e
         WHERE e.user_id = m.user_id AND e.course_id = 'crs_or_ca_initial' LIMIT 1),
       m.invite_token_hash, m.invite_expires_at, m.invited_at, m.claimed_at
FROM `clinic_members` m
WHERE m.role = 'ca';