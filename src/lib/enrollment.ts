/**
 * Enrollment lifecycle. An enrollment is unique per (user, course). Checkout
 * creates/refreshes a `pending` row; the Stripe webhook flips it to `active`
 * (paid). The dev/comp path activates it directly. A refund webhook revokes it.
 */
import { and, eq } from "drizzle-orm";
import type { Db } from "@/db/client";
import { schema } from "@/db/client";
import { newId } from "@/lib/crypto";
import { nowIso } from "@/lib/time";
import { logEvent } from "@/lib/events";

export type Enrollment = typeof schema.enrollments.$inferSelect;

/**
 * Expand a purchased course id into the course ids that should actually be
 * enrolled. A bundle (a course with `bundle_items`) fulfils to its constituent
 * courses; a normal course fulfils to itself. Used by both the comp path and the
 * Stripe webhook so one bundle purchase grants every constituent course.
 */
export async function expandFulfillment(
  db: Db,
  courseId: string,
): Promise<string[]> {
  const children = await db
    .select({ childCourseId: schema.bundleItems.childCourseId })
    .from(schema.bundleItems)
    .where(eq(schema.bundleItems.bundleCourseId, courseId))
    .all();
  return children.length > 0 ? children.map((c) => c.childCourseId) : [courseId];
}

async function find(
  db: Db,
  userId: string,
  courseId: string,
): Promise<Enrollment | null> {
  const row = await db
    .select()
    .from(schema.enrollments)
    .where(
      and(
        eq(schema.enrollments.userId, userId),
        eq(schema.enrollments.courseId, courseId),
      ),
    )
    .get();
  return row ?? null;
}

/** Create (or reuse) a pending enrollment before redirecting to Checkout. */
export async function ensurePendingEnrollment(
  db: Db,
  userId: string,
  courseId: string,
  amountCents: number,
): Promise<string> {
  const existing = await find(db, userId, courseId);
  if (existing) {
    if (existing.status === "active" || existing.status === "completed") {
      return existing.id; // already entitled
    }
    await db
      .update(schema.enrollments)
      .set({ status: "pending", paymentStatus: "unpaid", amountCents })
      .where(eq(schema.enrollments.id, existing.id));
    return existing.id;
  }
  const id = newId("enr");
  await db.insert(schema.enrollments).values({
    id,
    userId,
    courseId,
    status: "pending",
    paymentStatus: "unpaid",
    amountCents,
  });
  return id;
}

/** Activate an enrollment (paid via Stripe, or comped in dev). Idempotent. */
export async function activateEnrollment(
  db: Db,
  userId: string,
  courseId: string,
  opts: {
    paymentStatus: "paid" | "comp" | "free" | "clinic_seat";
    stripeCheckoutSessionId?: string;
    stripePaymentIntentId?: string;
    amountCents?: number;
  },
): Promise<void> {
  await ensurePendingEnrollment(db, userId, courseId, opts.amountCents ?? 0);
  const existing = await find(db, userId, courseId);
  if (!existing) return;
  if (existing.status === "active" || existing.status === "completed") return;

  await db
    .update(schema.enrollments)
    .set({
      status: "active",
      paymentStatus: opts.paymentStatus,
      stripeCheckoutSessionId: opts.stripeCheckoutSessionId ?? null,
      stripePaymentIntentId: opts.stripePaymentIntentId ?? null,
      amountCents: opts.amountCents ?? existing.amountCents,
      activatedAt: nowIso(),
    })
    .where(eq(schema.enrollments.id, existing.id));

  await logEvent(db, {
    userId,
    type: "enrollment_activated",
    courseId,
    payload: { paymentStatus: opts.paymentStatus },
  });
}

/** Revoke access on refund (PLAN.md decision #9). Found by payment intent. */
export async function revokeEnrollmentByPaymentIntent(
  db: Db,
  paymentIntentId: string,
): Promise<boolean> {
  const row = await db
    .select()
    .from(schema.enrollments)
    .where(eq(schema.enrollments.stripePaymentIntentId, paymentIntentId))
    .get();
  if (!row) return false;

  await db
    .update(schema.enrollments)
    .set({ status: "refunded", paymentStatus: "unpaid" })
    .where(eq(schema.enrollments.id, row.id));

  await logEvent(db, {
    userId: row.userId,
    type: "enrollment_revoked",
    courseId: row.courseId,
    payload: { reason: "refund", paymentIntentId },
  });
  return true;
}
