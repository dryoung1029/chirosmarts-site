/**
 * Acquire or renew the caller's single playback lease. Returns 409 when another
 * device currently holds a live lease (single active playback device).
 */
import type { APIRoute } from "astro";
import { getDb } from "@/db/client";
import { getLessonById } from "@/lib/courses";
import { canAccessModule } from "@/lib/entitlement";
import { acquireOrRenewLease, LEASE_TTL_SECONDS } from "@/lib/playback-lease";

const json = (data: unknown, status = 200) =>
  new Response(JSON.stringify(data), {
    status,
    headers: { "content-type": "application/json" },
  });

export const POST: APIRoute = async ({ request, locals }) => {
  const user = locals.user;
  if (!user) return json({ error: "unauthenticated" }, 401);

  const db = getDb(locals.runtime.env);
  const body = (await request.json().catch(() => ({}))) as {
    lessonId?: string;
    deviceId?: string;
  };
  if (!body.lessonId || !body.deviceId) {
    return json({ error: "lessonId and deviceId required" }, 400);
  }

  const ctx = await getLessonById(db, body.lessonId);
  if (!ctx) return json({ error: "lesson not found" }, 404);
  if (!(await canAccessModule(db, user.id, ctx.module))) {
    return json({ error: "not entitled" }, 403);
  }

  const result = await acquireOrRenewLease(
    db,
    user.id,
    body.lessonId,
    body.deviceId,
  );
  if (!result.ok) {
    return json(
      { ok: false, reason: result.reason, ttlSeconds: LEASE_TTL_SECONDS },
      409,
    );
  }
  return json({
    ok: true,
    stolen: result.stolen,
    expiresAt: result.lease.expiresAt,
    ttlSeconds: LEASE_TTL_SECONDS,
  });
};
