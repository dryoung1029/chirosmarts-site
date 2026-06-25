/**
 * Collateral Studio — generation engine (P1b).
 *
 * Turns a course's `lesson_transcripts` into draft collateral (study guide /
 * checklist / cheat-sheet) as Markdown, written in Dr. Young's voice
 * (`src/config/voice-profile.md`). Grounded ONLY in the transcripts — never
 * invents facts or regulatory claims (same discipline as the tutor).
 *
 * Model: Claude Sonnet for authoring (quality matters; infrequent admin action).
 * Large courses use a map-reduce: distil each lesson (Haiku) → compose (Sonnet),
 * so coverage survives without blowing the context window.
 *
 * No ANTHROPIC_API_KEY → `generateCollateral` throws `NotConfiguredError`, which
 * the admin endpoint surfaces as a clear "set the key" message (mirrors the
 * tutor / Stripe / Resend fallbacks).
 */
import Anthropic from "@anthropic-ai/sdk";
import { asc, eq, inArray } from "drizzle-orm";
import type { Db } from "@/db/client";
import { schema } from "@/db/client";
import voiceProfile from "@/config/voice-profile.md?raw";

const COMPOSE_MODEL = "claude-sonnet-4-6";
const DISTIL_MODEL = "claude-haiku-4-5";

// Above this assembled-source size we distil per lesson before composing.
const MAX_DIRECT_CHARS = 48_000;
const MAX_DISTIL_CHARS = 24_000; // cap a single lesson handed to the distiller

export type CollateralType = "study_guide" | "checklist" | "cheat_sheet";
export type CollateralScope = "course" | "module" | "lesson";

export class NotConfiguredError extends Error {
  constructor() {
    super("ANTHROPIC_API_KEY is not set");
    this.name = "NotConfiguredError";
  }
}

export class NoTranscriptError extends Error {
  constructor() {
    super("No transcripts found for the selected scope");
    this.name = "NoTranscriptError";
  }
}

export interface SourceLesson {
  id: string;
  title: string;
  transcript: string;
}
export interface AssembledSource {
  courseTitle: string;
  scopeLabel: string; // e.g. "whole course" or a module/lesson title
  lessons: SourceLesson[];
}

export function isConfigured(env: CloudflareEnv): boolean {
  return !!env.ANTHROPIC_API_KEY;
}

export const TYPE_LABEL: Record<CollateralType, string> = {
  study_guide: "Study guide",
  checklist: "Checklist",
  cheat_sheet: "Cheat-sheet",
};

/**
 * Gather the source transcripts for a scope, ordered module→lesson→chunk.
 * `scope='course'` → all lessons; `'module'` → one module's lessons;
 * `'lesson'` → a single lesson.
 */
export async function assembleSource(
  db: Db,
  courseId: string,
  scope: CollateralScope,
  scopeRefId?: string | null,
): Promise<AssembledSource> {
  const course = await db
    .select()
    .from(schema.courses)
    .where(eq(schema.courses.id, courseId))
    .get();
  if (!course) throw new NoTranscriptError();

  // Resolve the lessons in scope (ordered).
  const mods = await db
    .select()
    .from(schema.modules)
    .where(eq(schema.modules.courseId, courseId))
    .orderBy(asc(schema.modules.position))
    .all();
  const modIds = mods.map((m) => m.id);

  let lessons = modIds.length
    ? await db
        .select()
        .from(schema.lessons)
        .where(inArray(schema.lessons.moduleId, modIds))
        .orderBy(asc(schema.lessons.position))
        .all()
    : [];

  let scopeLabel = "whole course";
  if (scope === "module" && scopeRefId) {
    lessons = lessons.filter((l) => l.moduleId === scopeRefId);
    scopeLabel = mods.find((m) => m.id === scopeRefId)?.title ?? "module";
  } else if (scope === "lesson" && scopeRefId) {
    lessons = lessons.filter((l) => l.id === scopeRefId);
    scopeLabel = lessons[0]?.title ?? "lesson";
  }
  // Keep modules' order, then lessons' position (already ordered above by
  // position within the inArray result is not guaranteed across modules, so
  // re-sort by module position then lesson position).
  const modPos = new Map(mods.map((m, i) => [m.id, i]));
  lessons.sort(
    (a, b) =>
      (modPos.get(a.moduleId) ?? 0) - (modPos.get(b.moduleId) ?? 0) ||
      a.position - b.position,
  );

  const lessonIds = lessons.map((l) => l.id);
  const chunks = lessonIds.length
    ? await db
        .select()
        .from(schema.lessonTranscripts)
        .where(inArray(schema.lessonTranscripts.lessonId, lessonIds))
        .orderBy(asc(schema.lessonTranscripts.chunkIndex))
        .all()
    : [];

  const byLesson = new Map<string, string[]>();
  for (const ch of chunks) {
    const arr = byLesson.get(ch.lessonId) ?? [];
    arr.push(ch.text);
    byLesson.set(ch.lessonId, arr);
  }

  const sourceLessons: SourceLesson[] = lessons
    .map((l) => ({
      id: l.id,
      title: l.title,
      transcript: (byLesson.get(l.id) ?? []).join(" ").trim(),
    }))
    .filter((l) => l.transcript.length > 0);

  if (sourceLessons.length === 0) throw new NoTranscriptError();

  return { courseTitle: course.title, scopeLabel, lessons: sourceLessons };
}

// ---- prompt building ------------------------------------------------------

const SYSTEM_RULES = `You are creating downloadable study collateral for a continuing-education course. Write in the author's voice described below.

VOICE PROFILE
${voiceProfile}

ABSOLUTE RULES
- Ground EVERYTHING in the provided course material. Do not add facts, figures, statistics, fees, or regulatory claims that are not present in the source. If the source doesn't cover something, leave it out.
- This is training collateral for chiropractic assistants — never give patient-directed clinical/medical advice.
- Output GitHub-Flavored Markdown only. No preamble, no "here is your…", no code fences around the whole thing.
- Start with a single H1 title line.`;

function typeInstructions(type: CollateralType, courseTitle: string): string {
  switch (type) {
    case "study_guide":
      return `Create a STUDY GUIDE for "${courseTitle}".
Structure:
# <concise title>
A 1–2 sentence orientation (what this guide covers and how to use it).
## Learning objectives
- bullet list of what the learner should be able to do
## Section summaries
For each major topic in the source, a "### <topic>" heading with a tight summary in the author's voice.
## Key terms
A short definition list of important terms (term — plain-language definition).
## Check your understanding
6–10 self-check questions (no answer key).`;
    case "checklist":
      return `Create an actionable CHECKLIST for "${courseTitle}".
Structure:
# <concise title>
One sentence on when/how to use it.
Then grouped sections ("## <phase or topic>") of GitHub checkbox items ("- [ ] do X"). Each item must be a concrete, doable action drawn from the source — not a vague concept. Order them the way the work actually happens.`;
    case "cheat_sheet":
      return `Create a one-to-two page CHEAT-SHEET for "${courseTitle}".
Dense and scannable: short sections with bullets and small Markdown tables where they help (e.g., term/value, step/why). Lead with the must-know essentials. Use **bold** for the things a learner most needs to remember. No long paragraphs.`;
  }
}

function extractTitle(markdown: string, fallback: string): string {
  const m = markdown.match(/^\s*#\s+(.+?)\s*$/m);
  return (m?.[1] ?? fallback).slice(0, 200);
}

function client(env: CloudflareEnv): Anthropic {
  return new Anthropic({ apiKey: env.ANTHROPIC_API_KEY! });
}

async function complete(
  env: CloudflareEnv,
  model: string,
  system: string,
  user: string,
  maxTokens: number,
): Promise<string> {
  const msg = await client(env).messages.create({
    model,
    max_tokens: maxTokens,
    system,
    messages: [{ role: "user", content: user }],
  });
  return msg.content
    .filter((b): b is Anthropic.TextBlock => b.type === "text")
    .map((b) => b.text)
    .join("")
    .trim();
}

/** Distil one lesson's transcript into compact teaching notes (map step). */
async function distilLesson(
  env: CloudflareEnv,
  lesson: SourceLesson,
): Promise<string> {
  const notes = await complete(
    env,
    DISTIL_MODEL,
    "Extract the key teaching points from this course-lesson transcript as concise bullet notes. Capture concepts, definitions, steps, numbers, and any do/don't guidance. Be faithful — add nothing not in the transcript. Output bullets only.",
    `Lesson: ${lesson.title}\n\nTranscript:\n${lesson.transcript.slice(0, MAX_DISTIL_CHARS)}`,
    1500,
  );
  return `## ${lesson.title}\n${notes}`;
}

export interface GenerateResult {
  title: string;
  markdown: string;
  model: string;
}

/**
 * Generate collateral Markdown for an assembled source. Single-pass when the
 * source is small; otherwise map-reduce (distil per lesson, then compose).
 */
export async function generateCollateral(
  env: CloudflareEnv,
  source: AssembledSource,
  type: CollateralType,
): Promise<GenerateResult> {
  if (!isConfigured(env)) throw new NotConfiguredError();

  const totalChars = source.lessons.reduce(
    (n, l) => n + l.transcript.length,
    0,
  );

  let sourceBlock: string;
  if (totalChars <= MAX_DIRECT_CHARS) {
    sourceBlock = source.lessons
      .map((l) => `## Lesson: ${l.title}\n${l.transcript}`)
      .join("\n\n");
  } else {
    // Map: distil each lesson (sequential to respect Workers concurrency).
    const notes: string[] = [];
    for (const lesson of source.lessons) {
      notes.push(await distilLesson(env, lesson));
    }
    sourceBlock = notes.join("\n\n");
  }

  const user = `${typeInstructions(type, source.courseTitle)}

SCOPE: ${source.scopeLabel}

COURSE MATERIAL (the only source you may use):
${sourceBlock}`;

  const markdown = await complete(env, COMPOSE_MODEL, SYSTEM_RULES, user, 8000);
  const title = extractTitle(
    markdown,
    `${source.courseTitle} — ${TYPE_LABEL[type]}`,
  );
  return { title, markdown, model: COMPOSE_MODEL };
}
