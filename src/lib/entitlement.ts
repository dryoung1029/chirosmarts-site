/**
 * Access control for course content.
 *
 * A user may watch a lesson if EITHER its module is a free preview (Module 1),
 * OR they hold an active/completed paid enrollment for the course. Stripe
 * fulfilment lands in M3; until then enrollments can be comped (payment_status
 * `free`/`comp`) for testing.
 */
import { and, eq } from "drizzle-orm";
import type { Db } from "@/db/client";
import { schema } from "@/db/client";
import type { Module } from "@/lib/courses";

export async function hasActiveEnrollment(
  db: Db,
  userId: string,
  courseId: string,
): Promise<boolean> {
  const row = await db
    .select({ status: schema.enrollments.status })
    .from(schema.enrollments)
    .where(
      and(
        eq(schema.enrollments.userId, userId),
        eq(schema.enrollments.courseId, courseId),
      ),
    )
    .get();
  return !!row && (row.status === "active" || row.status === "completed");
}

/** Can this user watch lessons in this module right now? */
export async function canAccessModule(
  db: Db,
  userId: string,
  module: Module,
): Promise<boolean> {
  if (module.isFreePreview) return true;
  // module.courseId is the owning course.
  return hasActiveEnrollment(db, userId, module.courseId);
}

/**
 * Sequential knowledge-check gate.
 *
 * Watching video is necessary but not sufficient: a certificate requires every
 * quiz passed, so a student who rolls past the knowledge checks only discovers
 * the problem at the finish line (and, before this gate existed, believed they
 * were done). Each module therefore stays locked until every EARLIER module's
 * knowledge check is passed.
 *
 * Free-preview modules are never gated — the paywall preview must stay open.
 * Returns a map of moduleId → the module whose check is blocking it (null when
 * the module is reachable).
 */
export interface ModuleBlock {
  blockedByModuleTitle: string;
  blockedByModulePosition: number;
  quizId: string;
}

export async function getModuleQuizGate(
  db: Db,
  userId: string,
  courseId: string,
): Promise<Map<string, ModuleBlock | null>> {
  const { getCourseStructure } = await import("@/lib/courses");
  const { getModuleQuiz, hasPassed } = await import("@/lib/quiz");

  const structure = await getCourseStructure(db, courseId);
  const gate = new Map<string, ModuleBlock | null>();
  let blocker: ModuleBlock | null = null;

  for (const { module } of structure) {
    // A preview module is always reachable, and never blocks what follows it
    // for a student who hasn't enrolled yet.
    gate.set(module.id, module.isFreePreview ? null : blocker);

    if (!blocker) {
      const quiz = await getModuleQuiz(db, module.id);
      if (quiz && !(await hasPassed(db, userId, quiz.id))) {
        blocker = {
          blockedByModuleTitle: module.title,
          blockedByModulePosition: module.position,
          quizId: quiz.id,
        };
      }
    }
  }
  return gate;
}
