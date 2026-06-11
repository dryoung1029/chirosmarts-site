/**
 * Recomputed seat-time progress for the caller on one lesson: credited content
 * seconds, resume position, and completion. Always derived from `events`.
 */
import type { APIRoute } from "astro";
import { getDb } from "@/db/client";
import { getLessonById } from "@/lib/courses";
import { canAccessModule } from "@/lib/entitlement";
import { getLessonProgress } from "@/lib/progress";

const json = (data: unknown, status = 200) =>
  new Response(JSON.stringify(data), {
    status,
    headers: { "content-type": "application/json" },
  });

export const GET: APIRoute = async ({ locals, params }) => {
  const user = locals.user;
  if (!user) return json({ error: "unauthenticated" }, 401);

  const lessonId = params.id!;
  const db = getDb(locals.runtime.env);

  const ctx = await getLessonById(db, lessonId);
  if (!ctx) return json({ error: "lesson not found" }, 404);
  if (!(await canAccessModule(db, user.id, ctx.module))) {
    return json({ error: "not entitled" }, 403);
  }

  const progress = await getLessonProgress(
    db,
    user.id,
    lessonId,
    ctx.lesson.durationSeconds,
  );
  return json({ ok: true, progress });
};
