/**
 * Transfer the clinic manager role to another person (turnover). Owner-only.
 * Target is an existing CA (`memberId`) or anyone by `email`. On success the
 * caller is no longer the manager, so we send them back to their dashboard; the
 * new manager gets a sign-in link when they're reached by email.
 */
import type { APIRoute } from "astro";
import { getDb } from "@/db/client";
import { requireOwnedClinic } from "@/lib/clinic-guard";
import { transferClinicOwnership } from "@/lib/clinic";
import { createAndSendMagicLink } from "@/lib/auth/magic-link";

export const POST: APIRoute = async ({ request, locals, redirect }) => {
  const env = locals.runtime.env;
  const db = getDb(env);

  const clinic = await requireOwnedClinic(db, locals.user);
  if (!clinic) return redirect("/dashboard", 302);

  const form = await request.formData();
  const memberId = String(form.get("memberId") ?? "").trim() || null;
  const email = String(form.get("email") ?? "").trim() || null;

  const result = await transferClinicOwnership(db, clinic, { memberId, email });
  if (!result.ok) {
    return redirect(`/clinic?error=${encodeURIComponent(result.reason)}`, 303);
  }

  // Reached by email → send the new manager a sign-in link so they can take over.
  if (email) {
    await createAndSendMagicLink(db, env, result.newOwnerEmail);
  }

  // The caller has been demoted to student; their clinic page is gone now.
  return redirect("/dashboard?transferred=1", 303);
};
