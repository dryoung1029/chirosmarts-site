/**
 * Signed-in student: turn marketing email (renewal reminders, CE tips) on or
 * off from the dashboard. This is the "account settings" route to withdrawing
 * consent that the privacy policy promises, alongside the unsubscribe link.
 * Both paths go through @/lib/email-prefs, so they cover every list and are
 * logged the same way. (Blocked while an admin is impersonating; see
 * middleware.)
 */
import type { APIRoute } from "astro";
import { getDb } from "@/db/client";
import { resubscribeEmail, unsubscribeEmail } from "@/lib/email-prefs";

export const POST: APIRoute = async ({ request, locals, redirect }) => {
  const user = locals.user;
  if (!user) return redirect("/login", 303);
  const env = locals.runtime.env;
  const db = getDb(env);

  const action = String((await request.formData()).get("action") ?? "");
  if (action === "off") {
    await unsubscribeEmail(env, db, user.email, { source: "account_settings" });
  } else if (action === "on") {
    await resubscribeEmail(env, db, user.email, { source: "account_settings" });
  } else {
    return redirect("/dashboard", 303);
  }
  return redirect(`/dashboard?prefs=${action}#email-prefs`, 303);
};
