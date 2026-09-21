/**
 * Admin: create or update a course's final exam (access enforced in
 * middleware). One per course (moduleId = null). Passing this — not a module
 * knowledge check — is what marks the enrollment completed and issues the
 * certificate (see /api/quizzes/[id]/attempt.ts). passThreshold is entered as
 * a percent (blank = use the course default).
 */
import type { APIRoute } from "astro";
import { eq } from "drizzle-orm";
import { getDb, schema } from "@/db/client";
import { newId } from "@/lib/crypto";
import { getFinalExam } from "@/lib/quiz";

export const POST: APIRoute = async ({ params, request, locals, redirect }) => {
  const env = locals.runtime.env;
  const db = getDb(env);
  const courseId = params.id!;

  const course = await db
    .select({ id: schema.courses.id, title: schema.courses.title })
    .from(schema.courses)
    .where(eq(schema.courses.id, courseId))
    .get();
  if (!course) return redirect("/admin/content", 303);

  const back = (msg: string) =>
    redirect(`/admin/content/${courseId}?done=${encodeURIComponent(msg)}#final-exam`, 303);

  const form = await request.formData();
  const title = String(form.get("title") ?? "").trim() || `${course.title} — Final Exam`;
  const pctRaw = String(form.get("passThreshold") ?? "").trim();
  let passThreshold: number | null = null;
  if (pctRaw) {
    const pct = Number(pctRaw);
    if (!Number.isFinite(pct) || pct < 1 || pct > 100) return back("Pass score must be a percent between 1 and 100.");
    passThreshold = pct / 100;
  }

  const existing = await getFinalExam(db, courseId);
  if (existing) {
    await db
      .update(schema.quizzes)
      .set({ title, passThreshold })
      .where(eq(schema.quizzes.id, existing.id));
    return back("Final exam updated.");
  }

  await db.insert(schema.quizzes).values({
    id: newId("quiz"),
    courseId,
    moduleId: null,
    kind: "final_exam",
    title,
    passThreshold,
  });
  return back("Final exam created — add questions, or generate them with AI.");
};
