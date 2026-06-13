/**
 * Admin: AI-generate questions for a quiz from its module's transcripts (access
 * enforced in middleware). Appends them for review — nothing is shown to
 * students until the course creator keeps them.
 */
import type { APIRoute } from "astro";
import { appendQuestions, quizLocation } from "@/lib/admin/quiz-authoring";
import { generateQuizQuestions } from "@/lib/admin/quiz-gen";

export const POST: APIRoute = async ({ params, request, locals, redirect }) => {
  const env = locals.runtime.env;
  const quizId = params.id!;
  const loc = await quizLocation(env, quizId);
  if (!loc) return redirect("/admin/content", 303);
  const anchor = loc.moduleId ? `#mod-${loc.moduleId}` : "";
  const back = (msg: string) =>
    redirect(`/admin/content/${loc.courseId}?done=${encodeURIComponent(msg)}${anchor}`, 303);

  if (!loc.moduleId) return back("AI generation needs a module quiz (transcripts come from its lessons).");

  const form = await request.formData();
  const count = Number(form.get("count") ?? 5);

  try {
    const generated = await generateQuizQuestions(env, loc.moduleId, count);
    const added = await appendQuestions(
      env,
      quizId,
      generated.map((g) => ({
        prompt: g.prompt,
        type: "single_choice" as const,
        explanation: g.explanation,
        options: g.options.map((text, i) => ({ text, isCorrect: i === g.correctIndex })),
      })),
    );
    return back(`Generated ${added} question${added === 1 ? "" : "s"} — review and edit as needed.`);
  } catch (e) {
    return back(e instanceof Error ? e.message : "AI generation failed.");
  }
};
