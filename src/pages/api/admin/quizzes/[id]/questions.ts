/**
 * Admin: add one question to a quiz (access enforced in middleware). Supports
 * single-choice (up to 4 options + a correct radio) and true/false.
 */
import type { APIRoute } from "astro";
import { appendQuestions, quizLocation } from "@/lib/admin/quiz-authoring";
import type { QuestionType } from "@/lib/quiz-scoring";

/** Parse "mm:ss", "h:mm:ss", or plain seconds into integer seconds (or null). */
function parseTime(raw: string): number | null {
  const s = raw.trim();
  if (!s) return null;
  if (s.includes(":")) {
    const parts = s.split(":").map((p) => Number(p));
    if (parts.some((n) => !Number.isFinite(n))) return null;
    const secs = parts.reduce((acc, n) => acc * 60 + n, 0);
    return Number.isFinite(secs) && secs >= 0 ? Math.floor(secs) : null;
  }
  const n = Number(s);
  return Number.isFinite(n) && n >= 0 ? Math.floor(n) : null;
}

export const POST: APIRoute = async ({ params, request, locals, redirect }) => {
  const env = locals.runtime.env;
  const quizId = params.id!;
  const loc = await quizLocation(env, quizId);
  if (!loc) return redirect("/admin/content", 303);

  const anchor = loc.moduleId ? `#mod-${loc.moduleId}` : "";
  const back = (msg: string) =>
    redirect(`/admin/content/${loc.courseId}?done=${encodeURIComponent(msg)}${anchor}`, 303);

  const form = await request.formData();
  const prompt = String(form.get("prompt") ?? "").trim();
  if (!prompt) return back("Question text is required.");
  const type = (String(form.get("type") ?? "single_choice") as QuestionType);
  const explanation = String(form.get("explanation") ?? "").trim();

  let options: { text: string; isCorrect: boolean }[];
  if (type === "true_false") {
    const correct = String(form.get("tfCorrect") ?? "true");
    options = [
      { text: "True", isCorrect: correct === "true" },
      { text: "False", isCorrect: correct === "false" },
    ];
  } else {
    const correctIdx = Number(form.get("correct") ?? 0);
    options = [0, 1, 2, 3]
      .map((i) => ({ text: String(form.get(`opt${i}`) ?? "").trim(), idx: i }))
      .filter((o) => o.text.length > 0)
      .map((o) => ({ text: o.text, isCorrect: o.idx === correctIdx }));
  }

  if (options.filter((o) => o.text).length < 2) return back("Add at least two answer options.");
  if (!options.some((o) => o.isCorrect)) return back("Mark which option is correct.");

  // Optional deep-link: where the answer is taught (lesson + mm:ss or seconds).
  const sourceLessonId = String(form.get("sourceLessonId") ?? "").trim() || null;
  const sourceStartSeconds = sourceLessonId ? parseTime(String(form.get("sourceTime") ?? "")) : null;

  const added = await appendQuestions(env, quizId, [
    {
      prompt,
      type: type === "true_false" ? "true_false" : "single_choice",
      explanation,
      sourceLessonId,
      sourceStartSeconds,
      options,
    },
  ]);
  return back(added ? "Question added." : "Couldn't add the question — check the options.");
};
