/**
 * Seat-time progress, always RECOMPUTED from the append-only `events` trail —
 * never read from a stored counter (compliance req 1).
 *
 * For a lesson we pull its `lesson_heartbeat` events, turn them into position
 * coverage, and feed them to the pure `creditedSeconds()` core. The final-exam
 * gate sums credited content-seconds across every lesson in the course and
 * compares against `credit_hours × 3600`.
 */
import { and, eq } from "drizzle-orm";
import type { Db } from "@/db/client";
import { schema } from "@/db/client";
import {
  creditedSeconds,
  resumePosition,
  coverageFromHeartbeats,
  type Coverage,
} from "@/lib/seat-time";
import { getCourseStructure } from "@/lib/courses";

const HEARTBEAT = "lesson_heartbeat";

/** All heartbeat coverage intervals for one user + lesson. */
async function lessonCoverage(
  db: Db,
  userId: string,
  lessonId: string,
): Promise<Coverage[]> {
  const rows = await db
    .select({
      positionStartSeconds: schema.events.positionStartSeconds,
      positionEndSeconds: schema.events.positionEndSeconds,
    })
    .from(schema.events)
    .where(
      and(
        eq(schema.events.userId, userId),
        eq(schema.events.lessonId, lessonId),
        eq(schema.events.type, HEARTBEAT),
      ),
    )
    .all();
  return coverageFromHeartbeats(rows);
}

export interface LessonProgress {
  lessonId: string;
  durationSeconds: number;
  creditedSeconds: number;
  resumeSeconds: number;
  complete: boolean; // credited ≥ duration (full content coverage)
}

export async function getLessonProgress(
  db: Db,
  userId: string,
  lessonId: string,
  durationSeconds: number,
): Promise<LessonProgress> {
  const coverage = await lessonCoverage(db, userId, lessonId);
  const credited = creditedSeconds(coverage, durationSeconds);
  return {
    lessonId,
    durationSeconds,
    creditedSeconds: credited,
    resumeSeconds: resumePosition(coverage, durationSeconds),
    // "Complete" within a small tolerance so the last partial heartbeat counts.
    complete: durationSeconds > 0 && credited >= durationSeconds - 1,
  };
}

export interface CourseSeatTime {
  creditedSeconds: number; // summed across all lessons (each capped at its duration)
  totalContentSeconds: number; // summed lesson durations
  watchedFraction: number; // 0..1 across the whole course
  completionThreshold: number; // unlock threshold per lesson
  requiredSeconds: number; // explicit content-minutes floor for the exam (0 = none)
  examUnlocked: boolean;
  perLesson: (LessonProgress & { fraction: number; meetsThreshold: boolean })[];
}

// The final exam unlocks once the student has watched at least this fraction of
// EVERY lesson's content. Tied to completing the material rather than a fixed
// hour count, so it stays correct as lessons are added or removed. Policy knob —
// change here (PLAN.md §5), no schema change needed.
export const COMPLETION_THRESHOLD = 0.9;

/**
 * Course-wide seat time + the final-exam gate. The exam unlocks when the student
 * has (a) watched ≥ COMPLETION_THRESHOLD of unique content in EVERY lesson (the
 * no-skip rule, runtime-based) AND (b) accrued at least the course's explicit
 * `requiredSeatMinutes` content-minutes, when one is set. The minutes floor is
 * clamped to total runtime so it can never make the exam unreachable, and is
 * decoupled from `creditHours` (the certificate figure) — a course may grant
 * more credit than it has video (e.g. Vitals, with off-video practice).
 */
export async function getCourseSeatTime(
  db: Db,
  userId: string,
  courseId: string,
): Promise<CourseSeatTime> {
  const course = await db
    .select({ requiredSeatMinutes: schema.courses.requiredSeatMinutes })
    .from(schema.courses)
    .where(eq(schema.courses.id, courseId))
    .get();
  const structure = await getCourseStructure(db, courseId);
  const perLesson: CourseSeatTime["perLesson"] = [];
  let total = 0;
  let totalDuration = 0;
  for (const { lessons } of structure) {
    for (const lesson of lessons) {
      const p = await getLessonProgress(
        db,
        userId,
        lesson.id,
        lesson.durationSeconds,
      );
      // A zero-duration lesson (no video yet) can't gate anything → treat as met.
      const fraction =
        p.durationSeconds > 0 ? p.creditedSeconds / p.durationSeconds : 1;
      const meetsThreshold = fraction >= COMPLETION_THRESHOLD;
      perLesson.push({ ...p, fraction, meetsThreshold });
      total += p.creditedSeconds;
      totalDuration += p.durationSeconds;
    }
  }
  // Explicit content-minutes floor, clamped to runtime so the gate stays reachable.
  const requiredSeconds = Math.min(
    course?.requiredSeatMinutes != null ? course.requiredSeatMinutes * 60 : 0,
    totalDuration,
  );
  const examUnlocked =
    perLesson.length > 0 &&
    perLesson.every((p) => p.meetsThreshold) &&
    total >= requiredSeconds;
  return {
    creditedSeconds: total,
    totalContentSeconds: totalDuration,
    watchedFraction: totalDuration > 0 ? total / totalDuration : 0,
    completionThreshold: COMPLETION_THRESHOLD,
    requiredSeconds,
    examUnlocked,
    perLesson,
  };
}
