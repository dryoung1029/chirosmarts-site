/**
 * Admin: reset a user's learning state (access enforced in middleware). Keeps
 * the account; wipes enrollments, seat-time events, quiz attempts, certificates,
 * documents, and playback leases. Destructive — confirmed in the UI.
 */
import type { APIRoute } from "astro";
import { resetUserProgress } from "@/lib/admin/user-admin";

export const POST: APIRoute = async ({ params, locals, redirect }) => {
  const id = params.id!;
  await resetUserProgress(locals.runtime.env, id);
  return redirect(
    `/admin/students/${id}?done=${encodeURIComponent("Progress reset — enrollments, seat time, attempts, and certificates cleared.")}`,
    303,
  );
};
