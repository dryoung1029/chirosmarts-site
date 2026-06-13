/**
 * Admin: create or update a module's knowledge-check quiz (access enforced in
 * middleware). One quiz per module. passThreshold is entered as a percent
 * (blank = use the course default).
 */
import type { APIRoute } from "astro";
import { eq } from "drizzle-orm";
import { getDb, schema } from "@/db/client";
import { newId } from "@/lib/crypto";
import { getModuleQuiz } from "@/lib/quiz";

export const POST: APIRoute = async ({ params, request, locals, redirect }) => {
  const env = locals.runtime.env;
  const db = getDb(env);
  const moduleId = params.id!;

  const module = await db
    .select({ courseId: schema.modules.courseId, title: schema.modules.title })
    .from(schema.modules)
    .where(eq(schema.modules.id, moduleId))
    .get();
  if (!module) return redirect("/admin/content", 303);

  const back = (msg: string) =>
    redirect(`/admin/content/${module.courseId}?done=${encodeURIComponent(msg)}#mod-${moduleId}`, 303);

  const form = await request.formData();
  const title = String(form.get("title") ?? "").trim() || `${module.title} — knowledge check`;
  const pctRaw = String(form.get("passThreshold") ?? "").trim();
  // Percent → fraction; blank = null (course default). Clamp 1..100.
  let passThreshold: number | null = null;
  if (pctRaw) {
    const pct = Number(pctRaw);
    if (!Number.isFinite(pct) || pct < 1 || pct > 100) return back("Pass score must be a percent between 1 and 100.");
    passThreshold = pct / 100;
  }

  const existing = await getModuleQuiz(db, moduleId);
  if (existing) {
    await db
      .update(schema.quizzes)
      .set({ title, passThreshold })
      .where(eq(schema.quizzes.id, existing.id));
    return back("Quiz updated.");
  }

  await db.insert(schema.quizzes).values({
    id: newId("quiz"),
    courseId: module.courseId,
    moduleId,
    kind: "knowledge_check",
    title,
    passThreshold,
  });
  return back("Quiz created — add questions, or generate them with AI.");
};
