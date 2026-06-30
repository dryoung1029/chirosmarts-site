/**
 * AI quiz-question generation from a module's transcripts (admin only). Uses the
 * same Anthropic model as the tutor, grounded strictly in the module's ingested
 * transcript text. Returns parsed questions for review — the course creator can
 * edit or delete them before students ever see them.
 *
 * Each question also gets a deep-link target (source lesson + start second):
 * the model returns a verbatim quote of where the answer is taught, and we map
 * that quote back to the transcript cue it came from.
 */
import Anthropic from "@anthropic-ai/sdk";
import { asc, eq } from "drizzle-orm";
import { getDb, schema } from "@/db/client";

const MODEL = "claude-haiku-4-5";

export interface GeneratedQuestion {
  prompt: string;
  options: string[];
  correctIndex: number;
  explanation: string;
  sourceLessonId: string | null;
  sourceStartSeconds: number | null;
}

interface Cue {
  lessonId: string;
  startSeconds: number;
  text: string;
}

interface LessonCues {
  lessonId: string;
  title: string;
  cues: Cue[];
}

/** Transcript cues for every lesson in a module, grouped and ordered by lesson. */
async function moduleLessonCues(env: CloudflareEnv, moduleId: string): Promise<LessonCues[]> {
  const db = getDb(env);
  const lessons = await db
    .select({ id: schema.lessons.id, title: schema.lessons.title })
    .from(schema.lessons)
    .where(eq(schema.lessons.moduleId, moduleId))
    .orderBy(asc(schema.lessons.position))
    .all();

  const groups: LessonCues[] = [];
  for (const l of lessons) {
    const rows = await db
      .select({
        startSeconds: schema.lessonTranscripts.startSeconds,
        text: schema.lessonTranscripts.text,
      })
      .from(schema.lessonTranscripts)
      .where(eq(schema.lessonTranscripts.lessonId, l.id))
      .orderBy(asc(schema.lessonTranscripts.chunkIndex))
      .all();
    const cues = rows.map((r) => ({
      lessonId: l.id,
      startSeconds: Math.floor(r.startSeconds),
      text: r.text,
    }));
    if (cues.length) groups.push({ lessonId: l.id, title: l.title, cues });
  }
  return groups;
}

const normalize = (s: string) => s.toLowerCase().replace(/[^a-z0-9 ]+/g, " ").replace(/\s+/g, " ").trim();

/** Find the transcript cue a quote most likely came from (word-overlap). */
function matchCue(cues: Cue[], quote: string): Cue | null {
  const qWords = new Set(normalize(quote).split(" ").filter((w) => w.length > 3));
  if (qWords.size === 0) return null;
  let best: Cue | null = null;
  let bestScore = 0;
  for (const cue of cues) {
    const cWords = normalize(cue.text).split(" ");
    let score = 0;
    for (const w of cWords) if (qWords.has(w)) score += 1;
    if (score > bestScore) {
      bestScore = score;
      best = cue;
    }
  }
  // Require a couple of shared content words so we don't link to noise.
  return bestScore >= 2 ? best : null;
}

export async function generateQuizQuestions(
  env: CloudflareEnv,
  moduleId: string,
  count: number,
): Promise<GeneratedQuestion[]> {
  if (!env.ANTHROPIC_API_KEY) {
    throw new Error("AI isn't configured (missing ANTHROPIC_API_KEY).");
  }
  const n = Math.max(1, Math.min(20, Math.floor(count) || 5));
  const groups = await moduleLessonCues(env, moduleId);
  // Flat cue list is still what we match generated quotes back against.
  const cues = groups.flatMap((g) => g.cues);

  // Give every lesson a fair slice of the prompt budget so questions aren't
  // biased toward whichever lesson happens to come first. We label each lesson
  // section so the model knows the module spans multiple lessons and is told to
  // spread questions across all of them.
  const TOTAL_BUDGET = 14000;
  const lessonsWithText = groups.filter((g) => g.cues.some((c) => c.text.trim()));
  const perLessonBudget = lessonsWithText.length
    ? Math.floor(TOTAL_BUDGET / lessonsWithText.length)
    : TOTAL_BUDGET;
  const text = lessonsWithText
    .map((g, i) => {
      const body = g.cues.map((c) => c.text).join(" ").slice(0, perLessonBudget).trim();
      return `### LESSON ${i + 1}: ${g.title}\n${body}`;
    })
    .join("\n\n");
  if (text.replace(/### LESSON \d+:.*/g, "").trim().length < 200) {
    throw new Error(
      "Not enough transcript content to generate from — add captions/transcripts to this module's lessons first.",
    );
  }

  const multi = lessonsWithText.length > 1;
  const spread = multi
    ? `The content below is divided into ${lessonsWithText.length} lessons (marked "### LESSON N: title"). ` +
      `Distribute your questions across ALL lessons as evenly as the material allows — do NOT draw every ` +
      `question from the first lesson. Each lesson should be represented. `
    : "";

  const system =
    `You write multiple-choice quiz questions that test a student's comprehension of ` +
    `training content for chiropractic assistants. ${spread}Output ONLY valid JSON: an array of ` +
    `exactly ${n} objects, each {"prompt": string, "options": [4 strings], "correctIndex": ` +
    `integer 0-3, "explanation": string, "sourceQuote": string}. "sourceQuote" is a short ` +
    `VERBATIM phrase (6-15 words) copied exactly from the content where the answer is taught. ` +
    `Exactly one option is correct. Distractors must be plausible but clearly wrong per the ` +
    `material. Base every question STRICTLY on the provided content — never invent facts. ` +
    `Write all four options at roughly the SAME length, detail, and specificity — the correct ` +
    `answer must NOT be the longest, most-qualified, or most-detailed choice, since that gives ` +
    `the answer away. Vary which position (index 0-3) is correct across questions. Avoid ` +
    `"all/none of the above" and absolute words (always, never) unless they appear in the source. ` +
    `No preamble, no markdown, no code fences.`;

  const client = new Anthropic({ apiKey: env.ANTHROPIC_API_KEY });
  const message = await client.messages.create({
    model: MODEL,
    max_tokens: 4096,
    system,
    messages: [
      { role: "user", content: `CONTENT:\n${text}\n\nGenerate ${n} questions as a JSON array.` },
    ],
  });

  const raw = message.content
    .filter((b): b is Anthropic.TextBlock => b.type === "text")
    .map((b) => b.text)
    .join("")
    .trim();
  const json = raw.replace(/^```(?:json)?/i, "").replace(/```$/, "").trim();

  let parsed: unknown;
  try {
    parsed = JSON.parse(json);
  } catch {
    throw new Error("The AI returned malformed output — try again.");
  }
  if (!Array.isArray(parsed)) throw new Error("The AI returned unexpected output — try again.");

  const out: GeneratedQuestion[] = [];
  for (const q of parsed as any[]) {
    if (!q || typeof q.prompt !== "string" || !Array.isArray(q.options) || q.options.length < 2) continue;
    const correctIndex = Number(q.correctIndex);
    if (!Number.isInteger(correctIndex) || correctIndex < 0 || correctIndex >= q.options.length) continue;
    const cue = typeof q.sourceQuote === "string" ? matchCue(cues, q.sourceQuote) : null;
    out.push({
      prompt: q.prompt.trim(),
      options: q.options.map((o: unknown) => String(o).trim()).slice(0, 6),
      correctIndex,
      explanation: typeof q.explanation === "string" ? q.explanation.trim() : "",
      sourceLessonId: cue?.lessonId ?? null,
      sourceStartSeconds: cue ? cue.startSeconds : null,
    });
  }
  if (!out.length) throw new Error("The AI didn't return usable questions — try again.");
  return out;
}
