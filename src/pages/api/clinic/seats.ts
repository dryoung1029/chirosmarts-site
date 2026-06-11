/**
 * Purchase training seats for the clinic's pool.
 *
 * TEST MODE (no Stripe configured): seats are comped immediately and recorded
 * in the audit trail — mirrors how auth prints magic links to the console when
 * Resend isn't configured. In M3 this endpoint routes to Stripe Checkout instead
 * and the seats are granted by the paid webhook.
 */
import type { APIRoute } from "astro";
import { getDb } from "@/db/client";
import { getSiteUrl } from "@/lib/env";
import { requireOwnedClinic } from "@/lib/clinic-guard";
import { grantSeats } from "@/lib/clinic";
import { logEvent } from "@/lib/events";
import { isStripeConfigured, createSeatsCheckout } from "@/lib/stripe";
import { schema } from "@/db/client";
import { eq } from "drizzle-orm";

// Pre-Phase-4: clinic seats grant the CA initial course. Per-seat price = that
// course's current price (read from the DB — never hard-coded). Phase 4 makes
// this per-course (the owner picks which course's seats to buy).
const SEAT_COURSE_ID = "crs_or_ca_initial";

export const POST: APIRoute = async ({ request, locals, redirect }) => {
  const env = locals.runtime.env;
  const db = getDb(env);

  const clinic = await requireOwnedClinic(db, locals.user);
  if (!clinic) return redirect("/dashboard", 302);

  const form = await request.formData();
  const count = Number(form.get("count") ?? 0);
  if (!Number.isInteger(count) || count < 1 || count > 100) {
    return redirect(
      `/dashboard?error=${encodeURIComponent("Enter a seat count between 1 and 100.")}`,
      303,
    );
  }

  // Dev/comp path: no Stripe key → grant seats immediately (test mode).
  if (!isStripeConfigured(env)) {
    await grantSeats(db, clinic, count);
    await logEvent(db, {
      userId: locals.user!.id,
      type: "clinic_seats_granted",
      payload: { clinicId: clinic.id, count, method: "comp_test_mode" },
    });
    return redirect(`/dashboard?seats=${count}`, 303);
  }

  // Stripe Checkout for `count` seats; the webhook grants them on payment.
  // Seat price = the seat course's current DB price (dynamic, never hard-coded).
  const seatCourse = await db
    .select({ priceCents: schema.courses.priceCents })
    .from(schema.courses)
    .where(eq(schema.courses.id, SEAT_COURSE_ID))
    .get();
  if (!seatCourse) {
    return redirect(
      `/dashboard?error=${encodeURIComponent("Seat course is unavailable.")}`,
      303,
    );
  }
  const owner = await db
    .select({ email: schema.users.email })
    .from(schema.users)
    .where(eq(schema.users.id, locals.user!.id))
    .get();
  const site = getSiteUrl(env);
  const url = await createSeatsCheckout(env, {
    unitPriceCents: seatCourse.priceCents,
    quantity: count,
    customerEmail: owner?.email,
    clientReferenceId: locals.user!.id,
    metadata: { kind: "seats", clinicId: clinic.id, count: String(count) },
    successUrl: `${site}/dashboard?seats=${count}`,
    cancelUrl: `${site}/dashboard?error=${encodeURIComponent("Seat purchase canceled.")}`,
  });
  return redirect(url, 303);
};
