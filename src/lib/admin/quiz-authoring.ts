/**
 * Admin quiz authoring helpers: append questions (manual or AI-generated) to a
 * quiz, and resolve a quiz back to its course/module for redirect anchoring.
 */
import { eq } from "drizzle-orm";
import { getDb, schema } from "@/db/client";
import { newId } from "@/lib/crypto";
import type { QuestionType } from "@/lib/quiz-scoring";

export interface NewQuestion {
  prompt: string;
  type: QuestionType;
  explanation?: string;
  sourceLessonId?: string | null;
  sourceStartSeconds?: number | null;
  options: { text: string; isCorrect: boolean }[];
}

/** Append questions after any existing ones (positions continue from the max). */
export async function appendQuestions(
  env: CloudflareEnv,
  quizId: string,
  items: NewQuestion[],
): Promise<number> {
  const db = getDb(env);
  const existing = await db
    .select({ position: schema.questions.position })
    .from(schema.questions)
    .where(eq(schema.questions.quizId, quizId))
    .all();
  let pos = existing.reduce((m, r) => Math.max(m, r.position), 0);

  let added = 0;
  for (const it of items) {
    const clean = it.options.filter((o) => o.text.trim().length > 0);
    if (clean.length < 2 || !clean.some((o) => o.isCorrect)) continue; // skip invalid
    pos += 1;
    const qid = newId("q");
    await db.insert(schema.questions).values({
      id: qid,
      quizId,
      position: pos,
      prompt: it.prompt.trim(),
      type: it.type,
      explanation: it.explanation?.trim() || null,
      sourceLessonId: it.sourceLessonId ?? null,
      sourceStartSeconds: it.sourceStartSeconds ?? null,
    });
    await db.insert(schema.answerOptions).values(
      clean.map((o, i) => ({
        id: newId("opt"),
        questionId: qid,
        position: i,
        text: o.text.trim(),
        isCorrect: o.isCorrect,
      })),
    );
    added += 1;
  }
  return added;
}

/** Course + module ids for a quiz, for redirect anchoring back to the editor. */
export async function quizLocation(
  env: CloudflareEnv,
  quizId: string,
): Promise<{ courseId: string; moduleId: string | null } | null> {
  const db = getDb(env);
  const q = await db
    .select({ courseId: schema.quizzes.courseId, moduleId: schema.quizzes.moduleId })
    .from(schema.quizzes)
    .where(eq(schema.quizzes.id, quizId))
    .get();
  return q ?? null;
}

/** Delete a question and its answer options. */
export async function deleteQuestion(env: CloudflareEnv, questionId: string): Promise<void> {
  const db = getDb(env);
  await db.delete(schema.answerOptions).where(eq(schema.answerOptions.questionId, questionId));
  await db.delete(schema.questions).where(eq(schema.questions.id, questionId));
}
