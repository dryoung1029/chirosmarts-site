-- =============================================================================
-- reset-test-data.sql — wipe all USER/CLINIC test data, keep the CATALOG.
-- =============================================================================
-- PRE-LAUNCH TESTING ONLY. This deletes accounts, sign-ins, clinics, seats,
-- enrollments, roadmap progress, quiz attempts, certificates, documents, and
-- the audit `events` log. It is intentionally destructive — never run this once
-- real (post-launch) compliance data exists. Compliance rule: production data
-- is never auto-deleted; this is a deliberate, owner-authorized test reset.
--
-- PRESERVED (the content needed for the flow to work): courses, modules,
-- lessons, lesson_transcripts, transcript_embeddings, quizzes, questions,
-- answer_options, path_templates, path_template_steps, course_resources,
-- bundle_items.
--
-- Admin access survives this wipe: /admin is granted by the ADMIN_EMAILS env
-- allowlist, so signing back in with your admin email restores it.
--
-- Run (against the LIVE/remote test DB):
--   npx wrangler d1 execute chirosmarts --remote --file=./scripts/reset-test-data.sql
-- (Drop --remote to reset your LOCAL dev DB instead.)
-- =============================================================================

PRAGMA defer_foreign_keys = TRUE;

-- Children first, parents last (FK-safe ordering).

-- Clinic / seat graph
DELETE FROM seat_assignments;
DELETE FROM clinic_seat_pools;
DELETE FROM clinic_members;
DELETE FROM clinics;

-- Learning progress + records
DELETE FROM quiz_attempts;
DELETE FROM user_steps;
DELETE FROM user_paths;
DELETE FROM enrollments;
DELETE FROM certificates;
DELETE FROM documents;
DELETE FROM events;
DELETE FROM playback_leases;

-- Auth
DELETE FROM sessions;
DELETE FROM magic_links;

-- Marketing capture (test leads)
DELETE FROM marketing_leads;

-- Accounts last
DELETE FROM users;

-- ---- Verification: every count below should be 0 ----------------------------
SELECT 'users'             AS table_name, COUNT(*) AS rows FROM users
UNION ALL SELECT 'clinics',            COUNT(*) FROM clinics
UNION ALL SELECT 'clinic_members',     COUNT(*) FROM clinic_members
UNION ALL SELECT 'clinic_seat_pools',  COUNT(*) FROM clinic_seat_pools
UNION ALL SELECT 'seat_assignments',   COUNT(*) FROM seat_assignments
UNION ALL SELECT 'enrollments',        COUNT(*) FROM enrollments
UNION ALL SELECT 'user_paths',         COUNT(*) FROM user_paths
UNION ALL SELECT 'user_steps',         COUNT(*) FROM user_steps
UNION ALL SELECT 'quiz_attempts',      COUNT(*) FROM quiz_attempts
UNION ALL SELECT 'certificates',       COUNT(*) FROM certificates
UNION ALL SELECT 'documents',          COUNT(*) FROM documents
UNION ALL SELECT 'events',             COUNT(*) FROM events
UNION ALL SELECT 'sessions',           COUNT(*) FROM sessions;

-- ---- Sanity: catalog should be UNTOUCHED (non-zero) --------------------------
SELECT 'courses (kept)'       AS table_name, COUNT(*) AS rows FROM courses
UNION ALL SELECT 'lessons (kept)',          COUNT(*) FROM lessons
UNION ALL SELECT 'path_templates (kept)',   COUNT(*) FROM path_templates
UNION ALL SELECT 'transcript_embeddings (kept)', COUNT(*) FROM transcript_embeddings;
