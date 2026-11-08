/**
 * Admin: unsubscribe or resubscribe an address from marketing email (access
 * enforced in middleware). A reason is required either way: both go in the
 * append-only events log with the admin's identity.
 *
 * Resubscribing on someone's behalf should only follow THEIR request (e.g.
 * "I unsubscribed by mistake" by phone or email). Consent belongs to the
 * person, and the reason field is where that request is recorded.
 */
import type { APIRoute } from "astro";
import { getDb } from "@/db/client";
import { isValidEmail, normalizeEmail } from "@/lib/leads";
import { resubscribeEmail, unsubscribeEmail } from "@/lib/email-prefs";

export const POST: APIRoute = async ({ request, locals, redirect }) => {
  const env = locals.runtime.env;
  const form = await request.formData();
  const email = normalizeEmail(String(form.get("email") ?? ""));
  const action = String(form.get("action") ?? "");
  const reason = String(form.get("reason") ?? "").trim().slice(0, 500);
  // Only ever bounce back inside the admin area (no open redirect).
  const backRaw = String(form.get("back") ?? "");
  const back = backRaw.startsWith("/admin/") && !backRaw.startsWith("//") ? backRaw : "/admin/audience";
  const go = (key: "done" | "error", msg: string) =>
    redirect(`${back}${back.includes("?") ? "&" : "?"}${key}=${encodeURIComponent(msg)}`, 303);

  if (!isValidEmail(email)) return go("error", "Not a valid email address.");
  if (!reason) return go("error", "Add a reason. Email-preference changes are recorded in the audit trail.");

  const change = {
    source: "admin",
    reason,
    adminUserId: locals.realUser?.id ?? locals.user?.id ?? null,
    adminEmail: locals.realUser?.email ?? locals.user?.email ?? null,
  };
  const db = getDb(env);
  if (action === "unsubscribe") {
    await unsubscribeEmail(env, db, email, change);
    return go("done", `${email} is unsubscribed from all marketing email.`);
  }
  if (action === "resubscribe") {
    await resubscribeEmail(env, db, email, change);
    return go("done", `${email} is subscribed again.`);
  }
  return go("error", "Unknown action.");
};
