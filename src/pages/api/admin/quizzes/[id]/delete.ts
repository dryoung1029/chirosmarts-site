/**
 * Admin: delete a quiz and all its questions/options (access enforced in
 * middleware). Refuses if any attempts exist — quiz_attempts is the append-only
 * system of record and must not be orphaned.
 */
import type { APIRoute } from "astro";
import { eq, inArray, sql } from "drizzle-orm";
import { getDb, schema } from "@/db/client";
import { quizLocation } from "@/lib/admin/quiz-authoring";

export const POST: APIRoute = async ({ params, locals, redirect }) => {
  const env = locals.runtime.env;
  const db = getDb(env);
  const quizId = params.id!;
  const loc = await quizLocation(env, quizId);
  if (!loc) return redirect("/admin/content", 303);
  const anchor = loc.moduleId ? `#mod-${loc.moduleId}` : "";
  const back = (msg: string) =>
    redirect(`/admin/content/${loc.courseId}?done=${encodeURIComponent(msg)}${anchor}`, 303);

  const attempts = await db
    .select({ n: sql<number>`count(*)` })
    .from(schema.quizAttempts)
    .where(eq(schema.quizAttempts.quizId, quizId))
    .get();
  if ((attempts?.n ?? 0) > 0) {
    return back("Can't delete — students have attempts on record. Remove its questions instead.");
  }

  const qids = (
    await db
      .select({ id: schema.questions.id })
      .from(schema.questions)
      .where(eq(schema.questions.quizId, quizId))
      .all()
  ).map((r) => r.id);
  if (qids.length) {
    await db.delete(schema.answerOptions).where(inArray(schema.answerOptions.questionId, qids));
    await db.delete(schema.questions).where(eq(schema.questions.quizId, quizId));
  }
  await db.delete(schema.quizzes).where(eq(schema.quizzes.id, quizId));
  return back("Quiz deleted.");
};
