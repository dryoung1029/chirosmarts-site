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
  requiredSeconds: number; // credit_hours × 3600
  examUnlocked: boolean;
  perLesson: LessonProgress[];
}

/**
 * Course-wide seat time + the final-exam gate. The exam cannot unlock until
 * summed credited content-seconds ≥ credit_hours × 3600.
 */
export async function getCourseSeatTime(
  db: Db,
  userId: string,
  courseId: string,
  creditHours: number,
): Promise<CourseSeatTime> {
  const structure = await getCourseStructure(db, courseId);
  const perLesson: LessonProgress[] = [];
  let total = 0;
  for (const { lessons } of structure) {
    for (const lesson of lessons) {
      const p = await getLessonProgress(
        db,
        userId,
        lesson.id,
        lesson.durationSeconds,
      );
      perLesson.push(p);
      total += p.creditedSeconds;
    }
  }
  const requiredSeconds = Math.round(creditHours * 3600);
  return {
    creditedSeconds: total,
    requiredSeconds,
    examUnlocked: total >= requiredSeconds,
    perLesson,
  };
}
