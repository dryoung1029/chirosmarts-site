/** Owner revokes a pending seat assignment, freeing its seat (Phase 4). */
import type { APIRoute } from "astro";
import { getDb } from "@/db/client";
import { requireOwnedClinic } from "@/lib/clinic-guard";
import { revokeAssignment } from "@/lib/seat-pools";
import { logEvent } from "@/lib/events";

export const POST: APIRoute = async ({ request, locals, redirect }) => {
  const env = locals.runtime.env;
  const db = getDb(env);

  const clinic = await requireOwnedClinic(db, locals.user);
  if (!clinic) return redirect("/dashboard", 302);

  const form = await request.formData();
  const assignmentId = String(form.get("assignmentId") ?? "");

  const ok = await revokeAssignment(db, clinic.id, assignmentId);
  if (ok) {
    await logEvent(db, {
      userId: locals.user!.id,
      type: "clinic_seat_assignment_revoked",
      payload: { clinicId: clinic.id, assignmentId },
    });
  }
  return redirect("/clinic", 303);
};
