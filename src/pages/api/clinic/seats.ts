/**
 * Purchase training seats for a clinic's per-course pool (Phase 4).
 *
 * The owner picks WHICH course's seats to buy; the per-seat price is that
 * course's current DB price (never hard-coded). TEST MODE (no Stripe): seats are
 * comped immediately and recorded in the audit trail (mirrors how auth prints
 * magic links when Resend isn't configured). With Stripe configured, this routes
 * to Checkout and the paid webhook grants the seats to the right pool.
 */
import type { APIRoute } from "astro";
import { eq } from "drizzle-orm";
import { getDb, schema } from "@/db/client";
import { getSiteUrl } from "@/lib/env";
import { requireOwnedClinic } from "@/lib/clinic-guard";
import { grantPoolSeats } from "@/lib/seat-pools";
import { logEvent } from "@/lib/events";
import { isStripeConfigured, createSeatsCheckout } from "@/lib/stripe";

export const POST: APIRoute = async ({ request, locals, redirect }) => {
  const env = locals.runtime.env;
  const db = getDb(env);

  const clinic = await requireOwnedClinic(db, locals.user);
  if (!clinic) return redirect("/dashboard", 302);

  const form = await request.formData();
  const courseId = String(form.get("courseId") ?? "");
  const count = Number(form.get("count") ?? 0);
  if (!Number.isInteger(count) || count < 1 || count > 100) {
    return redirect(
      `/clinic?error=${encodeURIComponent("Enter a seat count between 1 and 100.")}`,
      303,
    );
  }

  // The course must be a published, purchasable course (price read from the DB).
  const course = await db
    .select({
      id: schema.courses.id,
      title: schema.courses.title,
      priceCents: schema.courses.priceCents,
      status: schema.courses.status,
    })
    .from(schema.courses)
    .where(eq(schema.courses.id, courseId))
    .get();
  if (!course || course.status !== "published") {
    return redirect(
      `/clinic?error=${encodeURIComponent("Choose a course to buy seats for.")}`,
      303,
    );
  }

  // Dev/comp path: no Stripe key → grant seats immediately (test mode).
  if (!isStripeConfigured(env)) {
    await grantPoolSeats(db, clinic.id, course.id, count);
    await logEvent(db, {
      userId: locals.user!.id,
      type: "clinic_pool_seats_granted",
      courseId: course.id,
      payload: { clinicId: clinic.id, count, method: "comp_test_mode" },
    });
    return redirect(`/clinic?seats=${count}`, 303);
  }

  // Stripe Checkout for `count` seats of this course; the webhook grants them.
  const owner = await db
    .select({ email: schema.users.email })
    .from(schema.users)
    .where(eq(schema.users.id, locals.user!.id))
    .get();
  const site = getSiteUrl(env);
  const url = await createSeatsCheckout(env, {
    unitPriceCents: course.priceCents,
    quantity: count,
    customerEmail: owner?.email,
    clientReferenceId: locals.user!.id,
    metadata: {
      kind: "seats",
      clinicId: clinic.id,
      courseId: course.id,
      count: String(count),
    },
    successUrl: `${site}/clinic?seats=${count}`,
    cancelUrl: `${site}/clinic?error=${encodeURIComponent("Seat purchase canceled.")}`,
  });
  return redirect(url, 303);
};
