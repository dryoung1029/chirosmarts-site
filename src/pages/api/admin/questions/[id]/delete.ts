/**
 * Admin: delete a single quiz question and its options (access enforced in
 * middleware).
 */
import type { APIRoute } from "astro";
import { eq } from "drizzle-orm";
import { getDb, schema } from "@/db/client";
import { deleteQuestion, quizLocation } from "@/lib/admin/quiz-authoring";

export const POST: APIRoute = async ({ params, locals, redirect }) => {
  const env = locals.runtime.env;
  const db = getDb(env);
  const questionId = params.id!;

  const q = await db
    .select({ quizId: schema.questions.quizId })
    .from(schema.questions)
    .where(eq(schema.questions.id, questionId))
    .get();
  if (!q) return redirect("/admin/content", 303);

  const loc = await quizLocation(env, q.quizId);
  await deleteQuestion(env, questionId);

  const anchor = loc?.moduleId ? `#mod-${loc.moduleId}` : "";
  return redirect(
    `/admin/content/${loc?.courseId ?? ""}?done=${encodeURIComponent("Question deleted.")}${anchor}`,
    303,
  );
};
