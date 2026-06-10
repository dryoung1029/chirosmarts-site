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
