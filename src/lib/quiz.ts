/**
 * Quiz data access. `quiz_attempts` is the SOLE, APPEND-ONLY system of record
 * for quiz results (PLAN.md decision #6): failed attempts are retained, never
 * overwritten, and `events` holds only a thin pointer to an attempt id.
 */
import { and, asc, desc, eq } from "drizzle-orm";
import type { Db } from "@/db/client";
import { schema } from "@/db/client";
import { newId } from "@/lib/crypto";
import { nowIso } from "@/lib/time";
import { logEvent } from "@/lib/events";
import {
  scoreAttempt,
  isPassing,
  type AnswerMap,
  type QuestionType,
} from "@/lib/quiz-scoring";

export type Quiz = typeof schema.quizzes.$inferSelect;

export interface QuestionWithOptions {
  id: string;
  position: number;
  prompt: string;
  type: QuestionType;
  explanation: string | null;
  sourceLessonId: string | null;
  sourceStartSeconds: number | null;
  options: {
    id: string;
    position: number;
    text: string;
    isCorrect: boolean; // server-only; never serialize to the client
  }[];
}

export interface QuizWithQuestions {
  quiz: Quiz;
  questions: QuestionWithOptions[];
}

export async function getQuiz(db: Db, quizId: string): Promise<Quiz | null> {
  const q = await db
    .select()
    .from(schema.quizzes)
    .where(eq(schema.quizzes.id, quizId))
    .get();
  return q ?? null;
}

/** Quiz with its ordered questions and answer options. */
export async function getQuizWithQuestions(
  db: Db,
  quizId: string,
): Promise<QuizWithQuestions | null> {
  const quiz = await getQuiz(db, quizId);
  if (!quiz) return null;

  const qrows = await db
    .select()
    .from(schema.questions)
    .where(eq(schema.questions.quizId, quizId))
    .orderBy(asc(schema.questions.position))
    .all();

  const questions: QuestionWithOptions[] = [];
  for (const q of qrows) {
    const options = await db
      .select()
      .from(schema.answerOptions)
      .where(eq(schema.answerOptions.questionId, q.id))
      .orderBy(asc(schema.answerOptions.position))
      .all();
    questions.push({
      id: q.id,
      position: q.position,
      prompt: q.prompt,
      type: q.type as QuestionType,
      explanation: q.explanation,
      sourceLessonId: q.sourceLessonId,
      sourceStartSeconds: q.sourceStartSeconds,
      options: options.map((o) => ({
        id: o.id,
        position: o.position,
        text: o.text,
        isCorrect: o.isCorrect,
      })),
    });
  }
  return { quiz, questions };
}

/** Find a module's knowledge check (or a course's final exam). */
export async function getModuleQuiz(
  db: Db,
  moduleId: string,
): Promise<Quiz | null> {
  const q = await db
    .select()
    .from(schema.quizzes)
    .where(eq(schema.quizzes.moduleId, moduleId))
    .get();
  return q ?? null;
}

export async function getFinalExam(
  db: Db,
  courseId: string,
): Promise<Quiz | null> {
  const q = await db
    .select()
    .from(schema.quizzes)
    .where(
      and(
        eq(schema.quizzes.courseId, courseId),
        eq(schema.quizzes.kind, "final_exam"),
      ),
    )
    .get();
  return q ?? null;
}

export type Attempt = typeof schema.quizAttempts.$inferSelect;

export async function getAttempts(
  db: Db,
  userId: string,
  quizId: string,
): Promise<Attempt[]> {
  return db
    .select()
    .from(schema.quizAttempts)
    .where(
      and(
        eq(schema.quizAttempts.userId, userId),
        eq(schema.quizAttempts.quizId, quizId),
      ),
    )
    .orderBy(desc(schema.quizAttempts.attemptNumber))
    .all();
}

/** Has the user ever passed this quiz? */
export async function hasPassed(
  db: Db,
  userId: string,
  quizId: string,
): Promise<boolean> {
  const attempts = await getAttempts(db, userId, quizId);
  return attempts.some((a) => a.passed);
}

/**
 * Quizzes in a course the user has NOT yet passed. Used to gate certificate
 * issuance — if a course has quizzes, they must all be passed before a
 * certificate is granted.
 */
export async function unpassedQuizzes(
  db: Db,
  userId: string,
  courseId: string,
): Promise<{ id: string; title: string }[]> {
  const quizzes = await db
    .select({ id: schema.quizzes.id, title: schema.quizzes.title })
    .from(schema.quizzes)
    .where(eq(schema.quizzes.courseId, courseId))
    .all();
  const out: { id: string; title: string }[] = [];
  for (const q of quizzes) {
    if (!(await hasPassed(db, userId, q.id))) out.push(q);
  }
  return out;
}

export interface SubmitResult {
  attemptId: string;
  attemptNumber: number;
  score: number;
  passed: boolean;
  perQuestion: { questionId: string; correct: boolean }[];
}

/**
 * Score and persist an attempt (append-only). The pass threshold is the quiz
 * override or the course default. Knowledge checks are attempt-to-proceed, so
 * callers may ignore `passed`; the final exam uses it as the 80% gate.
 */
export async function submitAttempt(
  db: Db,
  userId: string,
  quizId: string,
  answers: AnswerMap,
): Promise<SubmitResult | null> {
  const loaded = await getQuizWithQuestions(db, quizId);
  if (!loaded) return null;

  const course = await db
    .select({ passThreshold: schema.courses.passThreshold })
    .from(schema.courses)
    .where(eq(schema.courses.id, loaded.quiz.courseId))
    .get();
  const threshold = loaded.quiz.passThreshold ?? course?.passThreshold ?? 0.8;

  const result = scoreAttempt(
    loaded.questions.map((q) => ({
      id: q.id,
      type: q.type,
      options: q.options.map((o) => ({ id: o.id, isCorrect: o.isCorrect })),
    })),
    answers,
  );
  const passed = isPassing(result.score, threshold);

  const prior = await getAttempts(db, userId, quizId);
  const attemptNumber = (prior[0]?.attemptNumber ?? 0) + 1;

  const attemptId = newId("qa");
  await db.insert(schema.quizAttempts).values({
    id: attemptId,
    userId,
    quizId,
    attemptNumber,
    score: result.score,
    passed,
    answers, // JSON snapshot of submitted answers
    startedAt: nowIso(),
    submittedAt: nowIso(),
  });

  // Thin pointer event only — never duplicate the answers/score here.
  await logEvent(db, {
    userId,
    type: "quiz_attempt",
    courseId: loaded.quiz.courseId,
    quizId,
    payload: { quizAttemptId: attemptId },
  });

  return {
    attemptId,
    attemptNumber,
    score: result.score,
    passed,
    perQuestion: result.perQuestion.map((p) => ({
      questionId: p.questionId,
      correct: p.correct,
    })),
  };
}
