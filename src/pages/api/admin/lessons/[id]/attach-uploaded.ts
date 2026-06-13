/**
 * Admin: attach a just-uploaded Stream video to a lesson (access enforced in
 * middleware). Called by the browser after a tus upload completes. Sets only the
 * UID — the video is still processing, so duration_seconds stays 0 until the
 * admin Saves the lesson (which auto-detects the real runtime from Stream).
 */
import type { APIRoute } from "astro";
import { z } from "zod";
import { eq } from "drizzle-orm";
import { getDb, schema } from "@/db/client";

const Body = z.object({ uid: z.string().trim().min(1) });

const json = (data: unknown, status = 200) =>
  new Response(JSON.stringify(data), {
    status,
    headers: { "content-type": "application/json" },
  });

export const POST: APIRoute = async ({ params, request, locals }) => {
  const db = getDb(locals.runtime.env);
  const id = params.id!;

  const lesson = await db
    .select({ id: schema.lessons.id })
    .from(schema.lessons)
    .where(eq(schema.lessons.id, id))
    .get();
  if (!lesson) return json({ error: "Lesson not found." }, 404);

  const parsed = Body.safeParse(await request.json().catch(() => ({})));
  if (!parsed.success) return json({ error: "Missing video id." }, 400);

  await db
    .update(schema.lessons)
    .set({ streamVideoUid: parsed.data.uid })
    .where(eq(schema.lessons.id, id));
  return json({ ok: true });
};
