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

-- Modules: Module 1 free preview; paywall begins at Module 2.
-- (stream_video_uid values are real Cloudflare Stream IDs — not secrets;
-- playback is gated by signed tokens. Replace titles via M5 admin later.)
INSERT OR REPLACE INTO modules (id, course_id, position, title, description, is_free_preview) VALUES
  ('mod_intro', 'crs_or_ca_initial', 1, 'Module 1 — Welcome & Orientation', 'Free preview module.', 1),
  ('mod_scope', 'crs_or_ca_initial', 2, 'Module 2 — Scope of Practice', 'Paywall begins here.', 0),
  ('mod_3',     'crs_or_ca_initial', 3, 'Module 3', NULL, 0),
  ('mod_4',     'crs_or_ca_initial', 4, 'Module 4', NULL, 0);

-- One lesson (video) per module.
INSERT OR REPLACE INTO lessons
  (id, module_id, position, title, stream_video_uid, duration_seconds, evidence_type)
VALUES
  ('lsn_welcome', 'mod_intro', 1, 'Module 1 — Welcome & Orientation', 'bac9bcf3e19dae03b2e3337119aa34e0', 3139, 'playback_heartbeat'),
  ('lsn_mod2',    'mod_scope', 1, 'Module 2 — Scope of Practice',      '3bf8a9082418fd63c108f248f2db4419', 2858, 'playback_heartbeat'),
  ('lsn_mod3',    'mod_3',     1, 'Module 3',                          '37ee2d77b8e13d02da0a71bfcc01505c', 3230, 'playback_heartbeat'),
  ('lsn_mod4',    'mod_4',     1, 'Module 4',                          '5dee0067b3bf63c439bb438ee9603e9f', 2218, 'playback_heartbeat');

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

-- Placeholder final-exam questions (replace with real content via M5 admin).
INSERT OR REPLACE INTO questions (id, quiz_id, position, prompt, type, explanation) VALUES
  ('qf_1', 'qz_final', 1, 'How many total hours are required for Oregon initial CA certification?', 'single_choice', 'Twelve total: 8 didactic + 4 supervised hands-on.'),
  ('qf_2', 'qz_final', 2, 'A Chiropractic Assistant may adjust the spine when the supervising DC is busy.', 'true_false', 'False — spinal adjustment is outside a CA''s scope of practice.'),
  ('qf_3', 'qz_final', 3, 'Which of these are within a CA''s typical scope? (select all that apply)', 'multi_choice', 'CAs take vitals and prepare patients; they do not diagnose or adjust.'),
  ('qf_4', 'qz_final', 4, 'Patient health information must be kept confidential under which law?', 'single_choice', 'HIPAA governs protected health information.'),
  ('qf_5', 'qz_final', 5, 'Within what period must a new Oregon CA obtain BLS certification?', 'single_choice', 'Within the first year of certification.');

INSERT OR REPLACE INTO answer_options (id, question_id, position, text, is_correct) VALUES
  ('of_1a', 'qf_1', 1, '8 hours', 0),
  ('of_1b', 'qf_1', 2, '12 hours', 1),
  ('of_1c', 'qf_1', 3, '16 hours', 0),
  ('of_2a', 'qf_2', 1, 'True', 0),
  ('of_2b', 'qf_2', 2, 'False', 1),
  ('of_3a', 'qf_3', 1, 'Take and record vital signs', 1),
  ('of_3b', 'qf_3', 2, 'Prepare patients for the DC', 1),
  ('of_3c', 'qf_3', 3, 'Diagnose conditions', 0),
  ('of_3d', 'qf_3', 4, 'Perform spinal adjustments', 0),
  ('of_4a', 'qf_4', 1, 'HIPAA', 1),
  ('of_4b', 'qf_4', 2, 'OSHA', 0),
  ('of_4c', 'qf_4', 3, 'FERPA', 0),
  ('of_5a', 'qf_5', 1, 'Within the first year', 1),
  ('of_5b', 'qf_5', 2, 'Within five years', 0),
  ('of_5c', 'qf_5', 3, 'Never required', 0);

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

-- ---------------------------------------------------------------------------
-- Sample transcript for the free-preview lesson (M6 tutor demo + local tests).
-- Real transcripts are ingested from Riverside exports via upload-to-stream.
-- ---------------------------------------------------------------------------
INSERT OR REPLACE INTO lesson_transcripts
  (id, lesson_id, chunk_index, start_seconds, end_seconds, text)
VALUES
  ('lt_lsn_welcome_0', 'lsn_welcome', 0, 0, 18,
   'Welcome to the Oregon Chiropractic Assistant certification course. In this orientation we cover how the course works, how your seat time is tracked, and what you need to do to earn your certificate.'),
  ('lt_lsn_welcome_1', 'lsn_welcome', 1, 18, 42,
   'Your seat time is measured from the unique content you actually watch. Rewatching a section never counts twice, and the final exam unlocks only after you have completed the required content minutes for the course.'),
  ('lt_lsn_welcome_2', 'lsn_welcome', 2, 42, 70,
   'To take an accurate blood pressure, seat the patient with their back supported and feet flat, rest the arm at heart level, choose a correctly sized cuff, and place it about one inch above the elbow crease before inflating.'),
  ('lt_lsn_welcome_3', 'lsn_welcome', 3, 70, 96,
   'Throughout the course you will find knowledge checks at the end of each module and a final exam. The passing threshold is eighty percent, and your attempts are recorded for compliance.');

-- ===========================================================================
-- Additional standalone CE courses (multi-course catalog). Single module each.
-- Placeholder content — author real lessons/quizzes via the M5 admin editor and
-- upload video + transcripts via the upload-to-stream script.
-- ===========================================================================

-- Vitals: short video, but credit includes off-video practice logged on paper,
-- so credit_hours (1.0) deliberately exceeds video runtime. required_seat_minutes
-- (5) is the exam floor and is decoupled from the certificate's credit figure.
INSERT OR REPLACE INTO courses
  (id, slug, title, description, credit_hours, required_seat_minutes, topic_category,
   state, audience, content_type, access_model, price_cents, status, pass_threshold,
   max_playback_rate, instructor_name)
VALUES
  ('crs_vitals', 'vitals-monitoring',
   'Taking & Recording Vital Signs',
   'A focused single-module course on measuring and documenting patient vital signs, with a downloadable practice log.',
   1, 5, 'vitals', 'oregon', 'ca',
   'ce_course', 'one_time_purchase', 4900, 'published', 0.8, 1.5,
   'Jason Young, DC');

INSERT OR REPLACE INTO modules (id, course_id, position, title, description, is_free_preview) VALUES
  ('mod_vitals', 'crs_vitals', 1, 'Vital Signs — Measurement & Documentation', 'Blood pressure, pulse, respiration, temperature.', 0);

INSERT OR REPLACE INTO lessons
  (id, module_id, position, title, stream_video_uid, duration_seconds, evidence_type)
VALUES
  ('lsn_vitals', 'mod_vitals', 1, 'Vital Signs — Measurement & Documentation', NULL, 600, 'playback_heartbeat');

INSERT OR REPLACE INTO quizzes (id, course_id, module_id, kind, title, pass_threshold) VALUES
  ('qz_vitals_final', 'crs_vitals', NULL, 'final_exam', 'Vitals Final Exam', 0.8);

INSERT OR REPLACE INTO questions (id, quiz_id, position, prompt, type, explanation) VALUES
  ('qv_1', 'qz_vitals_final', 1, 'A blood-pressure cuff should be placed about how far above the elbow crease?', 'single_choice', 'About one inch (2–3 cm) above the antecubital crease.'),
  ('qv_2', 'qz_vitals_final', 2, 'The patient should be seated with feet flat and arm supported at heart level when taking blood pressure.', 'true_false', 'True — improper positioning skews the reading.');

INSERT OR REPLACE INTO answer_options (id, question_id, position, text, is_correct) VALUES
  ('ov_1a', 'qv_1', 1, 'One inch above the crease', 1),
  ('ov_1b', 'qv_1', 2, 'Directly over the crease', 0),
  ('ov_1c', 'qv_1', 3, 'On the forearm', 0),
  ('ov_2a', 'qv_2', 1, 'True', 1),
  ('ov_2b', 'qv_2', 2, 'False', 0);

-- HIPAA: single-module certification. required_seat_minutes left NULL (gate uses
-- per-lesson coverage only). credit_hours = 1.0.
INSERT OR REPLACE INTO courses
  (id, slug, title, description, credit_hours, required_seat_minutes, topic_category,
   state, audience, content_type, access_model, price_cents, status, pass_threshold,
   max_playback_rate, instructor_name)
VALUES
  ('crs_hipaa', 'hipaa-essentials',
   'HIPAA Essentials for Chiropractic Assistants',
   'A single-module HIPAA certification covering protected health information, the minimum-necessary rule, and front-desk privacy practices.',
   1, NULL, 'hipaa', 'oregon', 'ca',
   'ce_course', 'one_time_purchase', 4900, 'published', 0.8, 1.5,
   'Jason Young, DC');

INSERT OR REPLACE INTO modules (id, course_id, position, title, description, is_free_preview) VALUES
  ('mod_hipaa', 'crs_hipaa', 1, 'HIPAA Essentials', 'PHI, minimum necessary, and privacy at the front desk.', 0);

INSERT OR REPLACE INTO lessons
  (id, module_id, position, title, stream_video_uid, duration_seconds, evidence_type)
VALUES
  ('lsn_hipaa', 'mod_hipaa', 1, 'HIPAA Essentials', NULL, 600, 'playback_heartbeat');

INSERT OR REPLACE INTO quizzes (id, course_id, module_id, kind, title, pass_threshold) VALUES
  ('qz_hipaa_final', 'crs_hipaa', NULL, 'final_exam', 'HIPAA Final Exam', 0.8);

INSERT OR REPLACE INTO questions (id, quiz_id, position, prompt, type, explanation) VALUES
  ('qh_1', 'qz_hipaa_final', 1, 'Which law governs the privacy of protected health information (PHI)?', 'single_choice', 'HIPAA — the Health Insurance Portability and Accountability Act.'),
  ('qh_2', 'qz_hipaa_final', 2, 'The minimum-necessary rule means you should access only the PHI needed for the task at hand.', 'true_false', 'True — access and disclosure are limited to what the task requires.');

INSERT OR REPLACE INTO answer_options (id, question_id, position, text, is_correct) VALUES
  ('oh_1a', 'qh_1', 1, 'HIPAA', 1),
  ('oh_1b', 'qh_1', 2, 'OSHA', 0),
  ('oh_1c', 'qh_1', 3, 'FERPA', 0),
  ('oh_2a', 'qh_2', 1, 'True', 1),
  ('oh_2b', 'qh_2', 2, 'False', 0);
