/**
 * Submit a quiz attempt. Scoring is server-authoritative; the client never sees
 * which options are correct. Entitlement and (for the final exam) the seat-time
 * gate are re-checked here so a crafted POST can't bypass them.
 *
 * Knowledge checks are attempt-to-proceed (any submission is fine). Passing the
 * final exam (≥ threshold) marks the enrollment completed — certificate issuance
 * follows in M4.
 */
import type { APIRoute } from "astro";
import { and, eq } from "drizzle-orm";
import { getDb } from "@/db/client";
import { schema } from "@/db/client";
import { getQuiz, submitAttempt } from "@/lib/quiz";
import { canAccessModule, hasActiveEnrollment } from "@/lib/entitlement";
import { getCourseSeatTime } from "@/lib/progress";
import { logEvent } from "@/lib/events";
import { nowIso } from "@/lib/time";
import type { AnswerMap } from "@/lib/quiz-scoring";

function parseAnswers(form: FormData): AnswerMap {
  const answers: AnswerMap = {};
  for (const [key, value] of form.entries()) {
    if (!key.startsWith("q:")) continue;
    const qid = key.slice(2);
    (answers[qid] ??= []).push(String(value));
  }
  return answers;
}

export const POST: APIRoute = async ({ request, locals, params, redirect }) => {
  const user = locals.user;
  if (!user) return redirect("/login", 302);

  const db = getDb(locals.runtime.env);
  const quizId = params.id!;
  const quiz = await getQuiz(db, quizId);
  if (!quiz) return redirect("/dashboard", 302);

  const course = await db
    .select()
    .from(schema.courses)
    .where(eq(schema.courses.id, quiz.courseId))
    .get();
  if (!course) return redirect("/dashboard", 302);
  const backToQuiz = `/learn/${course.slug}/quiz/${quizId}`;

  // --- Entitlement + gates (authoritative) ---
  if (quiz.moduleId) {
    const module = await db
      .select()
      .from(schema.modules)
      .where(eq(schema.modules.id, quiz.moduleId))
      .get();
    if (!module || !(await canAccessModule(db, user.id, module))) {
      return redirect(`/learn/${course.slug}`, 302);
    }
  } else {
    // Course-level final exam: requires enrollment + the seat-time gate.
    if (!(await hasActiveEnrollment(db, user.id, course.id))) {
      return redirect(`/learn/${course.slug}`, 302);
    }
    const seat = await getCourseSeatTime(
      db,
      user.id,
      course.id,
      course.creditHours,
    );
    if (!seat.examUnlocked) {
      return redirect(`${backToQuiz}?locked=1`, 303);
    }
  }

  const form = await request.formData();
  const answers = parseAnswers(form);
  const result = await submitAttempt(db, user.id, quizId, answers);
  if (!result) return redirect(`/learn/${course.slug}`, 302);

  // Passing the final exam completes the enrollment (certificate = M4).
  if (quiz.kind === "final_exam" && result.passed) {
    await db
      .update(schema.enrollments)
      .set({ status: "completed", completedAt: nowIso() })
      .where(
        and(
          eq(schema.enrollments.userId, user.id),
          eq(schema.enrollments.courseId, course.id),
        ),
      );
    await logEvent(db, {
      userId: user.id,
      type: "course_completed",
      courseId: course.id,
      payload: { quizAttemptId: result.attemptId, score: result.score },
    });
  }

  return redirect(`${backToQuiz}?attempt=${result.attemptId}`, 303);
};
