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
import { requireOwnedClinic } from "@/lib/clinic-guard";
import { grantSeats } from "@/lib/clinic";
import { logEvent } from "@/lib/events";

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

  // Stripe lands in M3; until then comp the seats so the flow is testable.
  if (!env.STRIPE_SECRET_KEY) {
    await grantSeats(db, clinic, count);
    await logEvent(db, {
      userId: locals.user!.id,
      type: "clinic_seats_granted",
      payload: { clinicId: clinic.id, count, method: "comp_test_mode" },
    });
    return redirect(`/dashboard?seats=${count}`, 303);
  }

  // M3: create a Stripe Checkout session for `count` seats and redirect to it.
  return redirect(
    `/dashboard?error=${encodeURIComponent("Seat purchase checkout is coming in M3.")}`,
    303,
  );
};
