/**
 * AI-suggested module descriptions for the admin content editor.
 *
 * Given a module's lesson transcripts, ask Claude to write ONE short catalog
 * description (not a paraphrase of every point). Admin-only, occasional use, so
 * we favor quality (Opus) over the tutor's cheaper Haiku. Returns a suggestion
 * the admin reviews and edits before saving — never writes to the DB directly.
 */
import Anthropic from "@anthropic-ai/sdk";
import { asc, eq, inArray } from "drizzle-orm";
import { schema, type Db } from "@/db/client";

const MODEL = "claude-opus-4-8";

const SYSTEM_PROMPT = `You write concise descriptions for the modules of a continuing-education course catalog.

Given a module's title and the transcript of its lessons, write ONE short description for THE MODULE: 1–2 sentences, roughly 25–45 words, that tell a prospective student what this module covers and why it matters.

Rules:
- Write a single cohesive description of the module as a whole. Do NOT list, enumerate, or paraphrase every point in the transcript.
- No bullet points, headings, markdown, preamble, or surrounding quotes — return only the description text.
- Plain, professional tone. Don't invent specifics that aren't supported by the transcript.`;

export type SuggestResult =
  | { ok: true; description: string }
  | { ok: false; error: string };

export async function suggestModuleDescription(
  db: Db,
  env: CloudflareEnv,
  moduleId: string,
): Promise<SuggestResult> {
  const module = await db
    .select({ title: schema.modules.title })
    .from(schema.modules)
    .where(eq(schema.modules.id, moduleId))
    .get();
  if (!module) return { ok: false, error: "Module not found." };

  if (!env.ANTHROPIC_API_KEY) {
    return { ok: false, error: "AI isn't configured (missing ANTHROPIC_API_KEY)." };
  }

  const lessons = await db
    .select({ id: schema.lessons.id })
    .from(schema.lessons)
    .where(eq(schema.lessons.moduleId, moduleId))
    .all();
  if (lessons.length === 0) {
    return { ok: false, error: "This module has no lessons yet." };
  }

  const chunks = await db
    .select({ text: schema.lessonTranscripts.text })
    .from(schema.lessonTranscripts)
    .where(inArray(schema.lessonTranscripts.lessonId, lessons.map((l) => l.id)))
    .orderBy(asc(schema.lessonTranscripts.lessonId), asc(schema.lessonTranscripts.chunkIndex))
    .all();
  if (chunks.length === 0) {
    return {
      ok: false,
      error: "No transcripts for this module yet — ingest a transcript first, then try again.",
    };
  }

  // Cap the prompt so a long module doesn't blow up token use; the opening
  // material is enough to characterize the module.
  const transcript = chunks.map((c) => c.text).join(" ").slice(0, 12000);

  const client = new Anthropic({ apiKey: env.ANTHROPIC_API_KEY });
  const message = await client.messages.create({
    model: MODEL,
    max_tokens: 200,
    system: SYSTEM_PROMPT,
    messages: [
      {
        role: "user",
        content: `MODULE TITLE: ${module.title}\n\nTRANSCRIPT:\n${transcript}\n\nWrite the module description.`,
      },
    ],
  });

  if (message.stop_reason === "refusal") {
    return { ok: false, error: "Couldn't generate a description for this content." };
  }

  const description = message.content
    .filter((b): b is Anthropic.TextBlock => b.type === "text")
    .map((b) => b.text)
    .join("")
    .trim()
    .replace(/^["']|["']$/g, ""); // strip stray wrapping quotes

  if (!description) return { ok: false, error: "The model returned an empty description." };
  return { ok: true, description };
}
