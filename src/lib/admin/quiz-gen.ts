/**
 * AI quiz-question generation from a module's transcripts (admin only). Uses the
 * same Anthropic model as the tutor, grounded strictly in the module's ingested
 * transcript text. Returns parsed questions for review — the course creator can
 * edit or delete them before students ever see them.
 */
import Anthropic from "@anthropic-ai/sdk";
import { asc, eq, inArray } from "drizzle-orm";
import { getDb, schema } from "@/db/client";

const MODEL = "claude-haiku-4-5";

export interface GeneratedQuestion {
  prompt: string;
  options: string[];
  correctIndex: number;
  explanation: string;
}

/** Concatenated transcript text for every lesson in a module, in lesson order. */
export async function moduleTranscriptText(env: CloudflareEnv, moduleId: string): Promise<string> {
  const db = getDb(env);
  const lessons = await db
    .select({ id: schema.lessons.id })
    .from(schema.lessons)
    .where(eq(schema.lessons.moduleId, moduleId))
    .orderBy(asc(schema.lessons.position))
    .all();
  const ids = lessons.map((l) => l.id);
  if (!ids.length) return "";

  const parts: string[] = [];
  for (const id of ids) {
    const cues = await db
      .select({ text: schema.lessonTranscripts.text })
      .from(schema.lessonTranscripts)
      .where(eq(schema.lessonTranscripts.lessonId, id))
      .orderBy(asc(schema.lessonTranscripts.chunkIndex))
      .all();
    if (cues.length) parts.push(cues.map((c) => c.text).join(" "));
  }
  return parts.join("\n\n");
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
  const text = (await moduleTranscriptText(env, moduleId)).slice(0, 14000);
  if (text.trim().length < 200) {
    throw new Error(
      "Not enough transcript content to generate from — add captions/transcripts to this module's lessons first.",
    );
  }

  const system =
    `You write multiple-choice quiz questions that test a student's comprehension of ` +
    `training content for chiropractic assistants. Output ONLY valid JSON: an array of ` +
    `exactly ${n} objects, each {"prompt": string, "options": [4 strings], "correctIndex": ` +
    `integer 0-3, "explanation": string}. Exactly one option is correct. Distractors must be ` +
    `plausible but clearly wrong per the material. Base every question STRICTLY on the provided ` +
    `content — never invent facts. No preamble, no markdown, no code fences.`;

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
  // Tolerate stray code fences.
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
    out.push({
      prompt: q.prompt.trim(),
      options: q.options.map((o: unknown) => String(o).trim()).slice(0, 6),
      correctIndex,
      explanation: typeof q.explanation === "string" ? q.explanation.trim() : "",
    });
  }
  if (!out.length) throw new Error("The AI didn't return usable questions — try again.");
  return out;
}
