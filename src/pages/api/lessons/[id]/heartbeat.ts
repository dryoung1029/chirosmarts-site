/**
 * Append a playback heartbeat (compliance req 1). APPEND-ONLY: every heartbeat
 * is an immutable `lesson_heartbeat` event row; seat time is never stored, only
 * recomputed. A heartbeat is accepted only if the caller currently holds (or can
 * renew/steal) the playback lease — so a non-leaseholder can't accrue time.
 *
 * The client fires these ~every 45s, ONLY while playing in a focused tab. Each
 * carries the content-position interval covered since the last beat plus the
 * wall time and playback rate (for the audit trail). Playback rate is capped per
 * course; an over-cap beat is rejected (the player also enforces the cap).
 */
import type { APIRoute } from "astro";
import { getDb } from "@/db/client";
import { getLessonById } from "@/lib/courses";
import { canAccessModule } from "@/lib/entitlement";
import { acquireOrRenewLease } from "@/lib/playback-lease";
import { logEvent } from "@/lib/events";
import { getLessonProgress } from "@/lib/progress";

const json = (data: unknown, status = 200) =>
  new Response(JSON.stringify(data), {
    status,
    headers: { "content-type": "application/json" },
  });

const clamp = (v: number, lo: number, hi: number) =>
  Math.max(lo, Math.min(hi, v));

interface Beat {
  deviceId?: string;
  positionStart?: number;
  positionEnd?: number;
  wallSeconds?: number;
  playbackRate?: number;
}

export const POST: APIRoute = async ({ request, locals, params }) => {
  const user = locals.user;
  if (!user) return json({ error: "unauthenticated" }, 401);

  const lessonId = params.id!;
  const db = getDb(locals.runtime.env);
  const body = (await request.json().catch(() => ({}))) as Beat;

  if (
    !body.deviceId ||
    typeof body.positionStart !== "number" ||
    typeof body.positionEnd !== "number"
  ) {
    return json({ error: "deviceId, positionStart, positionEnd required" }, 400);
  }

  const ctx = await getLessonById(db, lessonId);
  if (!ctx) return json({ error: "lesson not found" }, 404);
  if (!(await canAccessModule(db, user.id, ctx.module))) {
    return json({ error: "not entitled" }, 403);
  }

  const maxRate = ctx.course.maxPlaybackRate;
  const rate = typeof body.playbackRate === "number" ? body.playbackRate : 1;
  if (rate > maxRate + 0.01) {
    return json({ error: "playback rate exceeds course cap", maxRate }, 400);
  }

  // Lease guard: renew if this device holds it, steal if stale, refuse if a
  // different device is actively watching.
  const lease = await acquireOrRenewLease(
    db,
    user.id,
    lessonId,
    body.deviceId,
  );
  if (!lease.ok) {
    return json({ ok: false, reason: lease.reason }, 409);
  }

  const duration = ctx.lesson.durationSeconds;
  const positionStart = clamp(body.positionStart, 0, duration);
  const positionEnd = clamp(body.positionEnd, 0, duration);
  const wallSeconds =
    typeof body.wallSeconds === "number"
      ? clamp(body.wallSeconds, 0, 600)
      : null;

  await logEvent(db, {
    userId: user.id,
    type: "lesson_heartbeat",
    courseId: ctx.course.id,
    lessonId,
    positionStartSeconds: positionStart,
    positionEndSeconds: positionEnd,
    wallSeconds,
    playbackRate: rate,
  });

  const progress = await getLessonProgress(db, user.id, lessonId, duration);
  return json({ ok: true, progress });
};
