/** Owner invites a CA by email. Reserves a seat and sends the claim link. */
import type { APIRoute } from "astro";
import { getDb } from "@/db/client";
import { requireOwnedClinic } from "@/lib/clinic-guard";
import { inviteCa } from "@/lib/clinic";
import { sendClinicInvite } from "@/lib/email/clinic";
import { logEvent } from "@/lib/events";

export const POST: APIRoute = async ({ request, locals, redirect }) => {
  const env = locals.runtime.env;
  const db = getDb(env);

  const clinic = await requireOwnedClinic(db, locals.user);
  if (!clinic) return redirect("/dashboard", 302);

  const form = await request.formData();
  const email = String(form.get("email") ?? "");

  const result = await inviteCa(db, clinic, email);
  if (!result.ok) {
    return redirect(`/dashboard?error=${encodeURIComponent(result.reason)}`, 303);
  }

  const { url, delivered } = await sendClinicInvite(env, {
    to: result.member.email,
    clinicName: clinic.name,
    token: result.token,
  });
  await logEvent(db, {
    userId: locals.user!.id,
    type: "clinic_invite_sent",
    payload: { clinicId: clinic.id, email: result.member.email },
  });

  // In dev (no Resend key) surface the claim link so it's testable.
  if (!delivered && !env.RESEND_API_KEY) {
    return redirect(`/dashboard?invited=1&dev=${encodeURIComponent(url)}`, 303);
  }
  return redirect(`/dashboard?invited=1`, 303);
};
