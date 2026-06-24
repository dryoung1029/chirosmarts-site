/**
 * Start admin "view as" impersonation. Admin-only; sets the impersonation cookie
 * and drops the admin onto the target user's dashboard. Read-only is enforced in
 * middleware. Logged to the audit trail.
 */
import type { APIRoute } from "astro";
import { getDb } from "@/db/client";
import { isAdmin } from "@/lib/admin";
import { setImpersonation } from "@/lib/auth/impersonation";
import { logEvent } from "@/lib/events";

export const POST: APIRoute = async ({ request, locals, cookies, redirect }) => {
  const env = locals.runtime.env;
  // Only a real (non-impersonating) admin may start.
  if (locals.impersonating || !isAdmin(env, locals.realUser)) {
    return redirect("/dashboard", 302);
  }

  const form = await request.formData();
  const userId = String(form.get("userId") ?? "").trim();
  if (!userId || userId === locals.realUser!.id) {
    return redirect("/admin/students", 303);
  }

  setImpersonation(cookies, userId);
  await logEvent(getDb(env), {
    userId: locals.realUser!.id,
    type: "admin_impersonation_started",
    payload: { targetUserId: userId },
  });
  return redirect("/dashboard", 303);
};
