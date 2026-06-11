/**
 * Mint a short-lived signed Stream playback token for an entitled user+lesson.
 * Falls back to a dev response (no token) when Stream isn't configured, so the
 * player can switch to the local simulator.
 */
import type { APIRoute } from "astro";
import { getDb } from "@/db/client";
import { getLessonById } from "@/lib/courses";
import { canAccessModule } from "@/lib/entitlement";
import {
  isStreamConfigured,
  signStreamToken,
  streamPlaybackUrls,
} from "@/lib/stream";

const json = (data: unknown, status = 200) =>
  new Response(JSON.stringify(data), {
    status,
    headers: { "content-type": "application/json" },
  });

export const POST: APIRoute = async ({ request, locals }) => {
  const user = locals.user;
  if (!user) return json({ error: "unauthenticated" }, 401);

  const db = getDb(locals.runtime.env);
  const body = (await request.json().catch(() => ({}))) as { lessonId?: string };
  if (!body.lessonId) return json({ error: "lessonId required" }, 400);

  const ctx = await getLessonById(db, body.lessonId);
  if (!ctx) return json({ error: "lesson not found" }, 404);
  if (!(await canAccessModule(db, user.id, ctx.module))) {
    return json({ error: "not entitled" }, 403);
  }

  if (!ctx.lesson.streamVideoUid) {
    return json({ ready: false, reason: "no_video", dev: true });
  }
  if (!isStreamConfigured(locals.runtime.env)) {
    // No signing key locally — surface the uid so the dev simulator can run.
    return json({
      ready: false,
      reason: "stream_not_configured",
      dev: true,
      uid: ctx.lesson.streamVideoUid,
    });
  }

  const token = await signStreamToken(
    locals.runtime.env,
    ctx.lesson.streamVideoUid,
  );
  return json({ ready: true, urls: streamPlaybackUrls(locals.runtime.env, token) });
};
