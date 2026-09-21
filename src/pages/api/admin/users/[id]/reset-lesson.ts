/**
 * Admin: reset seat time for one lesson (troubleshooting). Access enforced in
 * middleware. Clears this user's heartbeats + lease for the lesson only.
 */
import type { APIRoute } from "astro";
import { resetLessonProgress } from "@/lib/admin/user-admin";

export const POST: APIRoute = async ({ params, request, locals, redirect }) => {
  const id = params.id!;
  const form = await request.formData();
  const lessonId = String(form.get("lessonId") ?? "").trim();
  if (!lessonId) return redirect(`/admin/students/${id}`, 303);
  await resetLessonProgress(locals.runtime.env, id, lessonId);
  return redirect(
    `/admin/students/${id}?done=${encodeURIComponent("Lesson seat time reset — the student can re-watch it.")}`,
    303,
  );
};
