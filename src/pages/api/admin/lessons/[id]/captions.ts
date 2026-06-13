/**
 * Admin: generate AI captions for a lesson's Stream video and ingest the
 * transcript into lesson_transcripts. Poll-safe and idempotent — the client
 * calls it repeatedly; each call advances the state machine without blocking:
 *
 *   no caption yet      → kick off generation, return { status: "inprogress" }
 *   still transcribing  → return { status: "inprogress" }
 *   ready               → download VTT, (re)write lesson_transcripts, { status: "ready", cues }
 *
 * Access enforced in middleware. Needs CF_ACCOUNT_ID + CF_STREAM_API_TOKEN.
 */
import type { APIRoute } from "astro";
import { eq } from "drizzle-orm";
import { getDb, schema } from "@/db/client";
import {
  isStreamManagementConfigured,
  listStreamCaptions,
  generateStreamCaption,
  fetchStreamCaptionVtt,
} from "@/lib/stream";
import { parseTranscript } from "@/lib/transcript";

const LANG = "en";

const json = (data: unknown, status = 200) =>
  new Response(JSON.stringify(data), {
    status,
    headers: { "content-type": "application/json" },
  });

export const POST: APIRoute = async ({ params, locals }) => {
  const env = locals.runtime.env;
  const db = getDb(env);
  const id = params.id!;

  const lesson = await db
    .select({ uid: schema.lessons.streamVideoUid })
    .from(schema.lessons)
    .where(eq(schema.lessons.id, id))
    .get();
  if (!lesson) return json({ error: "Lesson not found." }, 404);
  if (!lesson.uid) return json({ error: "Attach a Stream video to this lesson first." }, 400);
  if (!isStreamManagementConfigured(env)) {
    return json({ error: "Stream API token not configured (set CF_STREAM_API_TOKEN)." }, 400);
  }

  try {
    const caps = await listStreamCaptions(env, lesson.uid);
    const caption = caps.find((c) => c.language === LANG);

    if (!caption || caption.status === "error") {
      await generateStreamCaption(env, lesson.uid, LANG);
      return json({ status: "inprogress" });
    }
    if (caption.status === "inprogress") {
      return json({ status: "inprogress" });
    }

    // Ready → download + ingest.
    const vtt = await fetchStreamCaptionVtt(env, lesson.uid, LANG);
    const chunks = parseTranscript(vtt);
    if (chunks.length === 0) return json({ error: "The caption had no cues to ingest." }, 400);

    // Replace any prior transcript for this lesson, then insert in batches
    // (SQLite caps bound variables, so don't insert hundreds of rows at once).
    await db.delete(schema.lessonTranscripts).where(eq(schema.lessonTranscripts.lessonId, id));
    const rows = chunks.map((c) => ({
      id: `lt_${id}_${c.index}`,
      lessonId: id,
      chunkIndex: c.index,
      startSeconds: c.startSeconds,
      endSeconds: c.endSeconds,
      text: c.text,
    }));
    for (let i = 0; i < rows.length; i += 100) {
      await db.insert(schema.lessonTranscripts).values(rows.slice(i, i + 100));
    }
    return json({ status: "ready", cues: rows.length });
  } catch (e) {
    return json({ error: e instanceof Error ? e.message : "Caption step failed." }, 502);
  }
};
