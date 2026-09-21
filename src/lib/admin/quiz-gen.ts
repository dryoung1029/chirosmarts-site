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
/** Total transcript characters we send the model, split evenly across lessons. */
const PROMPT_BUDGET_CHARS = 14000;

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

/** Transcript cues across every module/lesson in a course, grouped and
 * ordered by lesson (for the course-level final exam, which should draw on
 * the whole course, not one module). */
async function courseLessonCues(env: CloudflareEnv, courseId: string): Promise<LessonCues[]> {
  const db = getDb(env);
  const modules = await db
    .select({ id: schema.modules.id })
    .from(schema.modules)
    .where(eq(schema.modules.courseId, courseId))
    .orderBy(asc(schema.modules.position))
    .all();
  const groups: LessonCues[] = [];
  for (const m of modules) groups.push(...(await moduleLessonCues(env, m.id)));
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

/** Fisher-Yates shuffle (not security-sensitive — just avoiding a positional
 * tell like "the correct answer is always option A"). */
function shuffle<T>(arr: T[]): T[] {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

async function generateFromCues(
  env: CloudflareEnv,
  lessonGroups: LessonCues[],
  count: number,
  notEnoughContentMessage: string,
): Promise<GeneratedQuestion[]> {
  if (!env.ANTHROPIC_API_KEY) {
    throw new Error("AI isn't configured (missing ANTHROPIC_API_KEY).");
  }
  const n = Math.max(1, Math.min(20, Math.floor(count) || 5));
  const cues = lessonGroups.flatMap((g) => g.cues);
  const lessonsWithText = lessonGroups.filter((g) => g.cues.length > 0);
  // Split the prompt budget per lesson BEFORE joining. Truncating the joined
  // string instead would drop later lessons entirely whenever the earlier ones
  // fill the budget — while the prompt below still promises the model every
  // lesson is present and asks for even coverage.
  const perLessonBudget = Math.floor(PROMPT_BUDGET_CHARS / Math.max(1, lessonsWithText.length));
  const text = lessonsWithText
    .map(
      (g, i) =>
        `### LESSON ${i + 1}: ${g.title}\n${g.cues.map((c) => c.text).join(" ").slice(0, perLessonBudget)}`,
    )
    .join("\n\n");
  if (text.trim().length < 200) {
    throw new Error(notEnoughContentMessage);
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
    `Exactly one option is correct. Base every question STRICTLY on the provided content — ` +
    `never invent facts.\n\n` +
    `Distractor quality is the most important part of this task — a test-taker who never ` +
    `watched the training must NOT be able to guess the correct answer from how it's written. ` +
    `Specifically:\n` +
    `- Every option (correct and incorrect) must be similar in LENGTH and level of DETAIL. ` +
    `Never make the correct answer the longest, most specific, or most hedged/qualified option — ` +
    `that's a dead giveaway. If the correct answer is one sentence, every distractor should also ` +
    `be about one sentence.\n` +
    `- Distractors must be plausible, topically relevant claims a person could genuinely believe ` +
    `— not random facts, not jokes, not obviously-absurd options, not "none of the above"/"all of ` +
    `the above".\n` +
    `- Avoid absolute words ("always", "never", "must") appearing only on wrong options, and avoid ` +
    `vague hedge words ("sometimes", "may") appearing only on the correct one — mix these evenly or ` +
    `omit them.\n` +
    `- Do not reuse exact phrasing from the source material only in the correct option; either ` +
    `paraphrase the correct answer too, or use similar terminology across all options.\n` +
    `- Vary which position (1st-4th) holds the correct answer across questions.\n\n` +
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

    // Shuffle option order server-side too — never trust the model to vary
    // the correct answer's position on its own across a whole batch.
    const options: string[] = q.options.map((o: unknown) => String(o).trim()).slice(0, 6);
    const order: number[] = shuffle(options.map((_, i) => i));
    const shuffled: string[] = order.map((i) => options[i]);
    const newCorrectIndex = order.indexOf(correctIndex);

    out.push({
      prompt: q.prompt.trim(),
      options: shuffled,
      correctIndex: newCorrectIndex,
      explanation: typeof q.explanation === "string" ? q.explanation.trim() : "",
      sourceLessonId: cue?.lessonId ?? null,
      sourceStartSeconds: cue ? cue.startSeconds : null,
    });
  }
  if (!out.length) throw new Error("The AI didn't return usable questions — try again.");
  return out;
}

export async function generateQuizQuestions(
  env: CloudflareEnv,
  moduleId: string,
  count: number,
): Promise<GeneratedQuestion[]> {
  const groups = await moduleLessonCues(env, moduleId);
  return generateFromCues(
    env,
    groups,
    count,
    "Not enough transcript content to generate from — add captions/transcripts to this module's lessons first.",
  );
}

/** Same generation, but drawing on transcripts from every module in the
 * course — for the course-level final exam. */
export async function generateFinalExamQuestions(
  env: CloudflareEnv,
  courseId: string,
  count: number,
): Promise<GeneratedQuestion[]> {
  const groups = await courseLessonCues(env, courseId);
  return generateFromCues(
    env,
    groups,
    count,
    "Not enough transcript content to generate from — add captions/transcripts to this course's lessons first.",
  );
}
