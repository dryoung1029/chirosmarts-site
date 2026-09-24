/**
 * Admin: switch an account between student and clinic owner (access enforced
 * in middleware). The real work — and why a clinic account needs more than a
 * role flip — is in @/lib/admin/account-type.
 */
import type { APIRoute } from "astro";
import { switchAccountType, type SwitchableRole } from "@/lib/admin/account-type";

export const POST: APIRoute = async ({ params, request, locals, redirect }) => {
  const id = params.id!;
  const back = (key: "done" | "error", msg: string) =>
    redirect(`/admin/students/${id}?${key}=${encodeURIComponent(msg)}`, 303);

  try {
    const form = await request.formData();
    const target = String(form.get("role") ?? "");
    if (target !== "student" && target !== "clinic_admin") {
      return back("error", "Pick either Student or Clinic owner.");
    }

    const result = await switchAccountType(
      locals.runtime.env,
      id,
      target as SwitchableRole,
      String(form.get("clinicName") ?? ""),
    );
    return back(result.ok ? "done" : "error", result.message);
  } catch (e) {
    // Report the driver's reason rather than a bare 500 — Drizzle's own message
    // is only the SQL, so the cause is what actually names the problem.
    console.error("[admin] account type switch failed", e);
    const cause = e instanceof Error && e.cause instanceof Error ? e.cause.message : "";
    const message = e instanceof Error ? e.message : String(e);
    return back("error", [cause, message].filter(Boolean).join(" ⟵ ").slice(0, 900));
  }
};
