/**
 * Admin: change a student's sign-in email (access enforced in middleware).
 * The new address must be typed TWICE — a typo here, unlike a typo in a display
 * name, locks the student out of their own account — and a reason is required
 * because the change is written to the append-only audit trail.
 */
import type { APIRoute } from "astro";
import { changeUserEmail } from "@/lib/admin/change-email";
import { normalizeEmail } from "@/lib/leads";

export const POST: APIRoute = async ({ params, request, locals, redirect }) => {
  const id = params.id!;
  const back = (key: "done" | "error", msg: string) =>
    redirect(`/admin/students/${id}?${key}=${encodeURIComponent(msg)}`, 303);

  try {
    const form = await request.formData();
    const newEmail = String(form.get("newEmail") ?? "");
    const confirm = String(form.get("newEmailConfirm") ?? "");
    if (normalizeEmail(newEmail) !== normalizeEmail(confirm)) {
      return back("error", "The two email addresses didn't match — nothing was changed.");
    }

    const result = await changeUserEmail(locals.runtime.env, {
      userId: id,
      newEmail,
      reason: String(form.get("reason") ?? ""),
      // Default to signing them out: the address is the login identity, and the
      // student can get straight back in with a magic link to the new inbox.
      revokeSessions: form.get("keepSessions") !== "on",
      adminUserId: locals.realUser?.id ?? locals.user?.id ?? null,
      adminEmail: locals.realUser?.email ?? locals.user?.email ?? null,
    });
    return back(result.ok ? "done" : "error", result.message);
  } catch (e) {
    console.error("[admin] email change failed", e);
    const cause = e instanceof Error && e.cause instanceof Error ? e.cause.message : "";
    const message = e instanceof Error ? e.message : String(e);
    return back("error", [cause, message].filter(Boolean).join(" ⟵ ").slice(0, 900));
  }
};
