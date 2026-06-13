/** Admin: update lesson metadata + attach a Stream video (access enforced in middleware). */
import type { APIRoute } from "astro";
import { z } from "zod";
import { eq } from "drizzle-orm";
import { getDb, schema } from "@/db/client";
import { isStreamManagementConfigured, fetchStreamDuration } from "@/lib/stream";

const Body = z.object({
  title: z.string().trim().min(1),
  position: z.coerce.number().int().min(0),
  // Cloudflare Stream video UID. Empty string clears the video.
  streamVideoUid: z.string().trim().default(""),
  // Optional manual runtime override (seconds). Blank → auto-detect from Stream.
  durationSeconds: z.coerce.number().int().min(0).optional(),
});

export const POST: APIRoute = async ({ params, request, locals, redirect }) => {
  const env = locals.runtime.env;
  const db = getDb(env);
  const id = params.id!;
  const lesson = await db
    .select({
      moduleId: schema.lessons.moduleId,
      streamVideoUid: schema.lessons.streamVideoUid,
      durationSeconds: schema.lessons.durationSeconds,
    })
    .from(schema.lessons)
    .where(eq(schema.lessons.id, id))
    .get();
  if (!lesson) return redirect("/admin/content", 303);
  const module = await db
    .select({ courseId: schema.modules.courseId })
    .from(schema.modules)
    .where(eq(schema.modules.id, lesson.moduleId))
    .get();
  const courseId = module?.courseId ?? "";
  // Anchor back to the lesson's module so saving doesn't jump to the top.
  const back = (msg: string) =>
    redirect(`/admin/content/${courseId}?done=${encodeURIComponent(msg)}#mod-${lesson.moduleId}`, 303);

  const form = Object.fromEntries(await request.formData());
  const parsed = Body.safeParse(form);
  if (!parsed.success) return back("Invalid input");
  const d = parsed.data;

  const newUid = d.streamVideoUid || null;
  const manualDuration = d.durationSeconds && d.durationSeconds > 0 ? d.durationSeconds : null;

  // Resolve the runtime. duration_seconds is the seat-time gate's denominator, so
  // we only ever set it to Stream's real value or an explicit manual override —
  // never a stale/guessed number.
  let duration = lesson.durationSeconds;
  if (!newUid) {
    duration = 0; // no video → no runtime
  } else if (manualDuration) {
    duration = manualDuration;
  } else if (newUid !== lesson.streamVideoUid || lesson.durationSeconds <= 0) {
    // UID is new (or we don't have a runtime yet) and no manual override → ask Stream.
    if (!isStreamManagementConfigured(env)) {
      return back(
        "Stream API token not configured — enter the duration (seconds) manually, or ask Claude to set the CF_STREAM_API_TOKEN secret.",
      );
    }
    const res = await fetchStreamDuration(env, newUid);
    if (!res.ok) return back(res.error);
    duration = res.duration;
  }

  await db
    .update(schema.lessons)
    .set({ title: d.title, position: d.position, streamVideoUid: newUid, durationSeconds: duration })
    .where(eq(schema.lessons.id, id));

  const note = newUid
    ? `Lesson saved — video attached (${Math.round(duration / 60)} min)`
    : lesson.streamVideoUid
      ? "Lesson saved — video removed"
      : "Lesson saved";
  return back(note);
};
