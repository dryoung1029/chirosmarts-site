-- Prod-safe catalog price card (PLAN.md Item 1).
-- Adds the new course SKUs as DRAFT rows so the price card lives in the DB, then
-- the owner authors content + publishes via the M5 admin editor. Uses INSERT OR
-- IGNORE: purely additive, never overwrites existing rows, never touches CA or
-- transcripts. Run once on prod: npm run db:seed:catalog:remote (see package.json)
-- or: wrangler d1 execute chirosmarts --remote --file=./scripts/seed-catalog.sql

INSERT OR IGNORE INTO courses
  (id, slug, title, description, credit_hours, required_seat_minutes, topic_category,
   state, audience, content_type, access_model, price_cents, status, pass_threshold,
   max_playback_rate, instructor_name)
VALUES
  ('crs_vitals', 'vitals-monitoring', 'Taking & Recording Vital Signs',
   'A focused single-module course on measuring and documenting patient vital signs, with a downloadable practice log.',
   1, 5, 'vitals', 'oregon', 'ca', 'ce_course', 'one_time_purchase', 3900, 'draft', 0.8, 2.0, 'Jason Young, DC'),

  ('crs_hipaa', 'hipaa-essentials', 'HIPAA Essentials for Chiropractic Assistants',
   'A single-module HIPAA certification covering protected health information, the minimum-necessary rule, and front-desk privacy practices.',
   1, NULL, 'hipaa', 'oregon', 'ca', 'ce_course', 'one_time_purchase', 3500, 'draft', 0.8, 2.0, 'Jason Young, DC'),

  ('crs_cultural', 'cultural-competency', 'Cultural Competency',
   'Standalone cultural competency CE for chiropractic assistants.',
   1, NULL, 'cultural_competency', 'oregon', 'ca', 'ce_course', 'one_time_purchase', 2900, 'draft', 0.8, 2.0, 'Jason Young, DC'),

  ('crs_cbt', 'cbt-chiropractic-practice', 'CBT in Chiropractic Practice',
   'Cognitive behavioral techniques applied in the chiropractic setting.',
   1, NULL, 'general', 'oregon', 'ca', 'ce_course', 'one_time_purchase', 4900, 'draft', 0.8, 2.0, 'Jason Young, DC'),

  ('crs_renewal_bundle', 'annual-renewal-bundle', 'Annual Renewal Bundle (6 hr)',
   'The annual CE bundle for renewing Oregon CAs — includes vitals and cultural competency.',
   6, NULL, 'general', 'oregon', 'ca', 'ce_course', 'one_time_purchase', 8900, 'draft', 0.8, 2.0, 'Jason Young, DC');

INSERT OR IGNORE INTO bundle_items (id, bundle_course_id, child_course_id) VALUES
  ('bi_renewal_vitals',   'crs_renewal_bundle', 'crs_vitals'),
  ('bi_renewal_cultural', 'crs_renewal_bundle', 'crs_cultural');
