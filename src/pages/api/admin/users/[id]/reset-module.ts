/**
 * Admin: reset seat time for a whole module (troubleshooting). Access enforced
 * in middleware. Clears this user's heartbeats + leases for the module's lessons.
 */
import type { APIRoute } from "astro";
import { resetModuleProgress } from "@/lib/admin/user-admin";

export const POST: APIRoute = async ({ params, request, locals, redirect }) => {
  const id = params.id!;
  const form = await request.formData();
  const moduleId = String(form.get("moduleId") ?? "").trim();
  if (!moduleId) return redirect(`/admin/students/${id}`, 303);
  await resetModuleProgress(locals.runtime.env, id, moduleId);
  return redirect(
    `/admin/students/${id}?done=${encodeURIComponent("Module seat time reset — the student can re-watch its lessons.")}`,
    303,
  );
};
