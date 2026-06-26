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
import handoutCraft from "@/config/handout-craft.md?raw";

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

const SYSTEM_RULES = `You are an instructional designer creating downloadable study collateral for a continuing-education course, written in the author's voice. Build a purpose-built learning artifact — not a reformatted transcript — using the craft brief below.

HANDOUT CRAFT BRIEF
${handoutCraft}

VOICE PROFILE
${voiceProfile}

ABSOLUTE RULES (override the craft brief on any conflict)
- GROUNDING: Every fact, figure, statistic, fee, clinical value, and regulatory claim must come from the provided course material. Never fabricate them. If the source doesn't cover something, leave it out rather than invent it.
- The ONLY thing you may add that isn't in the transcript is a clearly-hypothetical illustrative example ("Consider a patient who…") to make a concept concrete — and even then, invent no specific clinical values, doses, or facts, and never a false first-person anecdote.
- AUDIENCE: this is training collateral for chiropractic assistants (CAs). Frame objectives around what a CA must be able to DO. Never give patient-directed clinical/medical advice.
- Output GitHub-Flavored Markdown only. No preamble, no "here is your…", no code fences around the whole document.
- Start with a single H1 title line.
- Before finishing, silently run the craft brief's quality self-check and fix any gaps.`;

function typeInstructions(type: CollateralType, courseTitle: string): string {
  switch (type) {
    case "study_guide":
      return `Create a STUDY GUIDE for "${courseTitle}" — for post-session review and CEU study. Organize by CONCEPT (not transcript order). Target ~3–6 pages. Use this structure (omit a section only if the source truly has nothing for it):
# <concise title>
A 1–2 sentence orientation: what this covers and how to use it.
## Learning objectives
- SWBAT behaviors: "You'll be able to …" — observable actions a CA can perform, not "understand X".
## Key terms
Definitions FIRST (pre-training principle): term — plain-language definition.
## Core concepts
A "### <concept>" per major topic: a tight summary in the author's voice, each paired with a brief clinical application example (use a clearly-hypothetical "Consider…" example only if the transcript lacks one).
## Decision points & red flags
When to do X vs Y, contraindications, and red flags the source raises (a small table if it helps). Omit if none.
## Common errors & practice gaps
What CAs commonly get wrong, drawn from the instructor's "most people miss…" cues. This is high-value — include it whenever the source supports it.
## Evidence & standards
Any studies, guidelines, or regulatory standards the source cites. Omit if none.
## Check your understanding
6–10 questions spanning at least three Bloom's levels (recall → understanding → apply/analyze). No answer key.
## Keep it current
A one-line spaced-review nudge: revisit at 24 hours, 1 week, and 1 month.`;
    case "checklist":
      return `Create an actionable CHECKLIST / JOB AID for "${courseTitle}" — a performance-support tool, 1–2 pages. Every item must earn its place.
# <concise title>
One sentence on when and how to use it.
Then grouped sections ("## <phase or topic>") of GitHub checkbox items ("- [ ] do X"). Each item is a concrete, doable action drawn from the source — ordered the way the work actually happens. Pull any contraindications / red flags into a clearly marked "## Red flags — stop and escalate" section. End with a small "Version & date" line.`;
    case "cheat_sheet":
      return `Create a CLINICAL QUICK-REFERENCE CARD (cheat-sheet) for "${courseTitle}" — point-of-care use, 1–2 pages, scannable. Every piece of information must earn its place; if removing it wouldn't change what the CA does, cut it.
# <concise title>
Lead with the must-know essentials. Use short sections, bulleted steps for procedures, and small Markdown tables for key values/thresholds. Put **red flags / contraindications** in their own clearly-marked section. Bold the things a CA most needs to remember. No long paragraphs. End with a small "Version & date" line.`;
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
    `Extract the teaching signals from this course-lesson transcript for later handout assembly. Under each label below, list what's present (omit a label if nothing applies). Be faithful — add nothing not in the transcript. Cut filler, housekeeping, and tangents.

LEARNING OBJECTIVES · KEY TERMS (with definitions) · CORE CONCEPTS (1–2 sentences each) · PROCEDURAL STEPS · CLINICAL EVIDENCE/STANDARDS · CASE EXAMPLES · COMMON ERRORS/PRACTICE GAPS · DECISION CRITERIA (when X vs Y, contraindications, red flags) · NOTABLE QUOTES · RESOURCES · SELF-ASSESSMENT PROMPTS

Mark anything the instructor emphasized ("important", "remember this", repeated) with (!).`,
    `Lesson: ${lesson.title}\n\nTranscript:\n${lesson.transcript.slice(0, MAX_DISTIL_CHARS)}`,
    1800,
  );
  return `## Lesson: ${lesson.title}\n${notes}`;
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

  const user = `First, mentally mine the course material below for the 11 teaching signals (objectives, key terms, core concepts, procedural steps, evidence, case examples, common errors/practice gaps, decision criteria, notable quotes, resources, self-assessment prompts), weighting emphasized/repeated points. Cut filler and tangents. Then build the artifact below from those signals — organized by concept, not transcript order.

${typeInstructions(type, source.courseTitle)}

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

const REVISE_SYSTEM = `You are revising existing course collateral on the editor's instruction. Keep the author's voice and the document's structure; change only what the instruction asks, and leave everything else intact. Return the COMPLETE revised document as GitHub-Flavored Markdown — no commentary, no code fences around it.

VOICE PROFILE
${voiceProfile}

RULES
- Keep the H1 title line (update it only if the instruction asks).
- Stay grounded: do not invent facts, figures, fees, or regulatory claims. If the instruction asks for something the existing material doesn't support, do your best with what's there and don't fabricate.
- Preserve Markdown formatting (headings, lists, checkbox items, tables, bold).`;

export interface ReviseResult {
  title: string;
  markdown: string;
  model: string;
}

/** Apply a natural-language edit instruction to an existing collateral draft. */
export async function reviseCollateral(
  env: CloudflareEnv,
  currentMarkdown: string,
  instruction: string,
  fallbackTitle: string,
): Promise<ReviseResult> {
  if (!isConfigured(env)) throw new NotConfiguredError();
  const user = `INSTRUCTION:\n${instruction}\n\nCURRENT COLLATERAL:\n${currentMarkdown}`;
  const markdown = await complete(env, COMPOSE_MODEL, REVISE_SYSTEM, user, 8000);
  return {
    title: extractTitle(markdown, fallbackTitle),
    markdown,
    model: COMPOSE_MODEL,
  };
}
