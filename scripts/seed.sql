-- ChiroSmarts seed data (M0).
-- Idempotent-ish: uses fixed IDs and INSERT OR REPLACE so re-running is safe.
-- Run with: npm run db:seed:local   (or db:seed:remote once provisioned)
--
-- Creates: one student user, one published $149 Oregon CA initial course with
-- Module 1 (free) + a lesson + a knowledge check + a final exam, and the
-- Oregon initial & renewal path templates with their steps.

-- ---------------------------------------------------------------------------
-- User (fake student)
-- ---------------------------------------------------------------------------
INSERT OR REPLACE INTO users
  (id, email, legal_name, display_name, birth_month, clinic_name, role, marketing_consent)
VALUES
  ('usr_seed_student', 'student@example.com', 'Jane Q. Student', 'Jane', 4,
   'Cascade Family Chiropractic', 'student', 0);

-- ---------------------------------------------------------------------------
-- Course: Oregon CA Initial Certification (8 didactic hours)
-- ---------------------------------------------------------------------------
INSERT OR REPLACE INTO courses
  (id, slug, title, description, credit_hours, topic_category, state, audience,
   content_type, access_model, price_cents, status, pass_threshold,
   max_playback_rate, instructor_name)
VALUES
  ('crs_or_ca_initial', 'oregon-ca-initial',
   'Oregon Chiropractic Assistant — Initial Certification',
   'State-compliant initial certification course (8 didactic hours).',
   8, 'general', 'oregon', 'ca',
   'ce_course', 'one_time_purchase', 14900, 'published', 0.8, 1.5,
   'Jason Young, DC');

-- Module 1 (free preview) and Module 2 (paywalled)
INSERT OR REPLACE INTO modules (id, course_id, position, title, description, is_free_preview) VALUES
  ('mod_intro', 'crs_or_ca_initial', 1, 'Welcome & Orientation', 'Free preview module.', 1),
  ('mod_scope', 'crs_or_ca_initial', 2, 'Scope of Practice', 'Paywall begins here.', 0);

-- A lesson in Module 1
INSERT OR REPLACE INTO lessons
  (id, module_id, position, title, stream_video_uid, duration_seconds, evidence_type)
VALUES
  ('lsn_welcome', 'mod_intro', 1, 'Welcome to ChiroSmarts', NULL, 600, 'playback_heartbeat');

-- Module 1 knowledge check (attempt-to-proceed; no passing score required)
INSERT OR REPLACE INTO quizzes (id, course_id, module_id, kind, title) VALUES
  ('qz_kc_intro', 'crs_or_ca_initial', 'mod_intro', 'knowledge_check', 'Module 1 Knowledge Check');

INSERT OR REPLACE INTO questions (id, quiz_id, position, prompt, type, explanation) VALUES
  ('q_intro_1', 'qz_kc_intro', 1,
   'In Oregon, how many total hours are required for initial CA certification?',
   'single_choice',
   'Oregon requires 12 total hours: 8 didactic plus 4 supervised hands-on.');

INSERT OR REPLACE INTO answer_options (id, question_id, position, text, is_correct) VALUES
  ('a_intro_1a', 'q_intro_1', 1, '8 hours', 0),
  ('a_intro_1b', 'q_intro_1', 2, '12 hours', 1),
  ('a_intro_1c', 'q_intro_1', 3, '6 hours', 0),
  ('a_intro_1d', 'q_intro_1', 4, '20 hours', 0);

-- Course final exam (80% gate; unlocks only after seat-time requirement met)
INSERT OR REPLACE INTO quizzes (id, course_id, module_id, kind, title, pass_threshold) VALUES
  ('qz_final', 'crs_or_ca_initial', NULL, 'final_exam', 'Final Exam', 0.8);

-- ---------------------------------------------------------------------------
-- Path template: Oregon CA initial certification roadmap
-- ---------------------------------------------------------------------------
INSERT OR REPLACE INTO path_templates (id, slug, name, description, state, audience, status) VALUES
  ('pt_or_initial', 'oregon-ca-initial', 'Oregon CA — Initial Certification',
   'Step-by-step roadmap to becoming a certified Oregon Chiropractic Assistant.',
   'oregon', 'ca', 'published');

INSERT OR REPLACE INTO path_template_steps
  (id, template_id, position, key, title, description, step_type, course_id, evidence_required)
VALUES
  ('pts_i_account', 'pt_or_initial', 1, 'account', 'Create your account', 'Sign up and complete intake.', 'account', NULL, 0),
  ('pts_i_course',  'pt_or_initial', 2, 'course', 'Complete the 8-hour course', 'Finish all modules and the final exam.', 'course', 'crs_or_ca_initial', 0),
  ('pts_i_handson', 'pt_or_initial', 3, 'hands_on_log', '4-hour hands-on with signed log', 'Complete hands-on hours; upload the DC-signed log.', 'upload_log', NULL, 1),
  ('pts_i_obce',    'pt_or_initial', 4, 'obce_application', 'OBCE application', 'Submit your application to the Oregon Board.', 'external_action', NULL, 0),
  ('pts_i_prints',  'pt_or_initial', 5, 'fingerprinting', 'Fingerprinting', 'Complete fingerprint-based background check.', 'external_action', NULL, 0),
  ('pts_i_exam',    'pt_or_initial', 6, 'state_exam', 'State exam', 'Pass the Oregon CA state exam.', 'exam', NULL, 0),
  ('pts_i_certd',   'pt_or_initial', 7, 'certified', 'Certified', 'You are a certified Oregon CA.', 'custom', NULL, 0),
  ('pts_i_bls',     'pt_or_initial', 8, 'bls', 'BLS within first year', 'Obtain Basic Life Support certification within your first year.', 'bls', NULL, 1);

-- ---------------------------------------------------------------------------
-- Path template: Oregon CA renewal roadmap
-- ---------------------------------------------------------------------------
INSERT OR REPLACE INTO path_templates (id, slug, name, description, state, audience, status) VALUES
  ('pt_or_renewal', 'oregon-ca-renewal', 'Oregon CA — Annual Renewal',
   'Annual 6-hour CE renewal keyed to your birth month.',
   'oregon', 'ca', 'published');

INSERT OR REPLACE INTO path_template_steps
  (id, template_id, position, key, title, description, step_type, course_id, evidence_required)
VALUES
  ('pts_r_confirm', 'pt_or_renewal', 1, 'confirm_date', 'Confirm your renewal date', 'Renewal follows your birth month.', 'custom', NULL, 0),
  ('pts_r_bundle',  'pt_or_renewal', 2, 'ce_bundle', 'Complete the 6-hour CE bundle', 'Includes required vitals and cultural competency hours.', 'course', NULL, 0),
  ('pts_r_submit',  'pt_or_renewal', 3, 'submit_obce', 'Submit to OBCE', 'Submit your renewal to the Oregon Board.', 'external_action', NULL, 0);

-- ---------------------------------------------------------------------------
-- Path template: Clinic owner / manager roadmap (seat pool + invite CAs)
-- ---------------------------------------------------------------------------
INSERT OR REPLACE INTO path_templates (id, slug, name, description, state, audience, status) VALUES
  ('pt_clinic_owner', 'oregon-clinic-owner', 'Clinic — Train Your CAs',
   'Buy a pool of training seats and invite your Chiropractic Assistants to get certified.',
   'oregon', 'dc', 'published');

INSERT OR REPLACE INTO path_template_steps
  (id, template_id, position, key, title, description, step_type, course_id, evidence_required)
VALUES
  ('pts_c_account',  'pt_clinic_owner', 1, 'account', 'Set up your clinic', 'Create your clinic account and name your practice.', 'account', NULL, 0),
  ('pts_c_seats',    'pt_clinic_owner', 2, 'buy_seats', 'Purchase training seats', 'Buy a pool of CA training seats for your staff.', 'external_action', NULL, 0),
  ('pts_c_invite',   'pt_clinic_owner', 3, 'invite_cas', 'Invite your CAs', 'Invite each Chiropractic Assistant by email to claim a seat.', 'custom', NULL, 0),
  ('pts_c_track',    'pt_clinic_owner', 4, 'track_progress', 'Track them to certification', 'Follow each CA''s progress through the initial certification.', 'custom', NULL, 0);
