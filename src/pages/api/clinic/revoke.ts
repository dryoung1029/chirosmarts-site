/** Owner revokes a pending invite, freeing its seat. */
import type { APIRoute } from "astro";
import { getDb } from "@/db/client";
import { requireOwnedClinic } from "@/lib/clinic-guard";
import { revokeInvite } from "@/lib/clinic";
import { logEvent } from "@/lib/events";

export const POST: APIRoute = async ({ request, locals, redirect }) => {
  const env = locals.runtime.env;
  const db = getDb(env);

  const clinic = await requireOwnedClinic(db, locals.user);
  if (!clinic) return redirect("/dashboard", 302);

  const form = await request.formData();
  const memberId = String(form.get("memberId") ?? "");

  const ok = await revokeInvite(db, clinic.id, memberId);
  if (ok) {
    await logEvent(db, {
      userId: locals.user!.id,
      type: "clinic_invite_revoked",
      payload: { clinicId: clinic.id, memberId },
    });
  }
  return redirect("/dashboard", 303);
};
