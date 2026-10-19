ALTER TABLE `modules` ADD `knowledge_check_required` integer DEFAULT true NOT NULL;--> statement-breakpoint
-- Data: turn the knowledge-check gate OFF for the existing single-module CE
-- courses (Cultural Competency, Vitals, HIPAA). Scoped deliberately narrowly —
-- only courses that have exactly ONE module AND are in those three topic
-- categories — so a future multi-module course in the same category is not
-- silently ungated. Attempts are untouched; this only stops them gating.
UPDATE `modules`
SET `knowledge_check_required` = 0
WHERE `course_id` IN (
  SELECT c.`id` FROM `courses` c
  WHERE c.`topic_category` IN ('cultural_competency', 'vitals', 'hipaa')
    AND (SELECT COUNT(*) FROM `modules` m WHERE m.`course_id` = c.`id`) = 1
);
