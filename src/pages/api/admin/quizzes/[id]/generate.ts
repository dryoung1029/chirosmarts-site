/**
 * Admin: AI-generate questions for a quiz from its module's transcripts (access
 * enforced in middleware). Appends them for review — nothing is shown to
 * students until the course creator keeps them.
 */
import type { APIRoute } from "astro";
import { appendQuestions, quizLocation } from "@/lib/admin/quiz-authoring";
import { generateFinalExamQuestions, generateQuizQuestions } from "@/lib/admin/quiz-gen";

export const POST: APIRoute = async ({ params, request, locals, redirect }) => {
  const env = locals.runtime.env;
  const quizId = params.id!;
  const loc = await quizLocation(env, quizId);
  if (!loc) return redirect("/admin/content", 303);
  const anchor = loc.moduleId ? `#mod-${loc.moduleId}` : "#final-exam";
  const back = (msg: string) =>
    redirect(`/admin/content/${loc.courseId}?done=${encodeURIComponent(msg)}${anchor}`, 303);

  const form = await request.formData();
  const count = Number(form.get("count") ?? 5);

  try {
    const generated = loc.moduleId
      ? await generateQuizQuestions(env, loc.moduleId, count)
      : await generateFinalExamQuestions(env, loc.courseId, count);
    const added = await appendQuestions(
      env,
      quizId,
      generated.map((g) => ({
        prompt: g.prompt,
        type: "single_choice" as const,
        explanation: g.explanation,
        sourceLessonId: g.sourceLessonId,
        sourceStartSeconds: g.sourceStartSeconds,
        options: g.options.map((text, i) => ({ text, isCorrect: i === g.correctIndex })),
      })),
    );
    return back(`Generated ${added} question${added === 1 ? "" : "s"} — review and edit as needed.`);
  } catch (e) {
    return back(e instanceof Error ? e.message : "AI generation failed.");
  }
};
