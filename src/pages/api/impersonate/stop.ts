/**
 * Stop admin "view as" impersonation. Clears the cookie and returns to the admin
 * area. Exempt from the impersonation read-only block (see middleware).
 */
import type { APIRoute } from "astro";
import { getDb } from "@/db/client";
import { clearImpersonation } from "@/lib/auth/impersonation";
import { logEvent } from "@/lib/events";

export const POST: APIRoute = async ({ locals, cookies, redirect }) => {
  if (locals.impersonating && locals.realUser) {
    await logEvent(getDb(locals.runtime.env), {
      userId: locals.realUser.id,
      type: "admin_impersonation_stopped",
      payload: { targetUserId: locals.user?.id },
    });
  }
  clearImpersonation(cookies);
  return redirect("/admin/students", 303);
};
