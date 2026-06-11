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
  examUnlocked: boolean;
  perLesson: (LessonProgress & { fraction: number; meetsThreshold: boolean })[];
}

// The final exam unlocks once the student has watched at least this fraction of
// EVERY lesson's content. Tied to completing the material rather than a fixed
// hour count, so it stays correct as lessons are added or removed. Policy knob —
// change here (PLAN.md §5), no schema change needed.
export const COMPLETION_THRESHOLD = 0.9;

/**
 * Course-wide seat time + the final-exam gate. The exam unlocks only when the
 * student has watched ≥ COMPLETION_THRESHOLD of unique content in every lesson —
 * so skipping a module keeps the exam locked, regardless of total runtime.
 */
export async function getCourseSeatTime(
  db: Db,
  userId: string,
  courseId: string,
): Promise<CourseSeatTime> {
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
  const examUnlocked =
    perLesson.length > 0 && perLesson.every((p) => p.meetsThreshold);
  return {
    creditedSeconds: total,
    totalContentSeconds: totalDuration,
    watchedFraction: totalDuration > 0 ? total / totalDuration : 0,
    completionThreshold: COMPLETION_THRESHOLD,
    examUnlocked,
    perLesson,
  };
}
