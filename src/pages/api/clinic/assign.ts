/**
 * Owner assigns a course seat to a CA by email (Phase 4).
 *  - An already-active CA gets access immediately (no invite, no email).
 *  - A new / unclaimed CA gets an emailed one-time claim link.
 */
import type { APIRoute } from "astro";
import { eq } from "drizzle-orm";
import { getDb, schema } from "@/db/client";
import { requireOwnedClinic } from "@/lib/clinic-guard";
import { assignSeat } from "@/lib/seat-pools";
import { sendClinicInvite } from "@/lib/email/clinic";
import { logEvent } from "@/lib/events";

export const POST: APIRoute = async ({ request, locals, redirect }) => {
  const env = locals.runtime.env;
  const db = getDb(env);

  const clinic = await requireOwnedClinic(db, locals.user);
  if (!clinic) return redirect("/dashboard", 302);

  const form = await request.formData();
  const courseId = String(form.get("courseId") ?? "");
  const email = String(form.get("email") ?? "");

  const result = await assignSeat(db, clinic, courseId, email);
  if (!result.ok) {
    return redirect(`/clinic?error=${encodeURIComponent(result.reason)}`, 303);
  }

  await logEvent(db, {
    userId: locals.user!.id,
    type: "clinic_seat_assigned",
    courseId,
    payload: { clinicId: clinic.id, email: result.email, mode: result.mode },
  });

  // Active member → immediate grant, nothing to email.
  if (result.mode === "active") {
    return redirect(`/clinic?assigned=active`, 303);
  }

  // Invite path → email the claim link (course title for context).
  const course = await db
    .select({ title: schema.courses.title })
    .from(schema.courses)
    .where(eq(schema.courses.id, courseId))
    .get();
  const { url, delivered } = await sendClinicInvite(env, {
    to: result.email,
    clinicName: clinic.name,
    token: result.token!,
    courseTitle: course?.title,
  });

  // Whenever the email didn't actually go out (no Resend key, or key set but the
  // domain isn't verified yet), surface the claim link so the owner can share it
  // directly — this is what makes the clinic demo work without live email.
  if (!delivered) {
    return redirect(`/clinic?assigned=invited&invite=${encodeURIComponent(url)}`, 303);
  }
  return redirect(`/clinic?assigned=invited`, 303);
};
