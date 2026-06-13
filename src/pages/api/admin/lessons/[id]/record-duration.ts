/**
 * Admin: record a freshly-uploaded video's true runtime once Stream finishes
 * processing (access enforced in middleware). Poll-safe — the client calls it
 * after upload until it returns { status: "ready" }:
 *
 *   still processing → { status: "processing" }
 *   ready            → write duration_seconds, { status: "ready", seconds }
 *
 * duration_seconds is the seat-time gate's denominator, so it's only ever set to
 * Stream's real value. Needs CF_ACCOUNT_ID + CF_STREAM_API_TOKEN.
 */
import type { APIRoute } from "astro";
import { eq } from "drizzle-orm";
import { getDb, schema } from "@/db/client";
import { isStreamManagementConfigured, fetchStreamVideoStatus } from "@/lib/stream";

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
  if (!lesson.uid) return json({ error: "Lesson has no attached video." }, 400);
  if (!isStreamManagementConfigured(env)) {
    return json({ error: "Stream API token not configured." }, 400);
  }

  const status = await fetchStreamVideoStatus(env, lesson.uid);
  if (!status.found) return json({ error: "Video not found on Stream." }, 404);
  if (!status.ready) return json({ status: "processing" });

  await db
    .update(schema.lessons)
    .set({ durationSeconds: status.duration })
    .where(eq(schema.lessons.id, id));
  return json({ status: "ready", seconds: status.duration });
};
