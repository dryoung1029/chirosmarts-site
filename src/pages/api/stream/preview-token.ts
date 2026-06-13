/**
 * Mint a short-lived signed Stream token for a PUBLIC free-preview lesson — no
 * auth, no entitlement, no seat-time. Hard-gated on `lessons.is_preview`, so it
 * can never be used to obtain a token for paywalled content. The 5-minute cap
 * itself is enforced client-side by the preview player; this only authorizes
 * playback and tells the client where to stop.
 */
import type { APIRoute } from "astro";
import { eq } from "drizzle-orm";
import { getDb, schema } from "@/db/client";
import { isStreamConfigured, signStreamToken, streamPlaybackUrls } from "@/lib/stream";

const json = (data: unknown, status = 200) =>
  new Response(JSON.stringify(data), {
    status,
    headers: { "content-type": "application/json" },
  });

// Short window — a teaser doesn't need a long-lived token.
const PREVIEW_TTL_SECONDS = 60 * 30;

export const POST: APIRoute = async ({ request, locals }) => {
  const env = locals.runtime.env;
  const db = getDb(env);
  const body = (await request.json().catch(() => ({}))) as { lessonId?: string };
  if (!body.lessonId) return json({ error: "lessonId required" }, 400);

  const lesson = await db
    .select({
      isPreview: schema.lessons.isPreview,
      previewSeconds: schema.lessons.previewSeconds,
      streamVideoUid: schema.lessons.streamVideoUid,
      title: schema.lessons.title,
    })
    .from(schema.lessons)
    .where(eq(schema.lessons.id, body.lessonId))
    .get();

  if (!lesson || !lesson.isPreview) return json({ error: "no preview" }, 404);
  if (!lesson.streamVideoUid) return json({ ready: false, reason: "no_video" });
  if (!isStreamConfigured(env)) return json({ ready: false, reason: "stream_not_configured" });

  const token = await signStreamToken(env, lesson.streamVideoUid, PREVIEW_TTL_SECONDS);
  return json({
    ready: true,
    urls: streamPlaybackUrls(env, token),
    previewSeconds: lesson.previewSeconds,
    title: lesson.title,
  });
};
