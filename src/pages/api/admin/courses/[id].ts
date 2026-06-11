/** Admin: update course metadata (access enforced in middleware). */
import type { APIRoute } from "astro";
import { z } from "zod";
import { eq } from "drizzle-orm";
import { getDb, schema } from "@/db/client";
import { nowIso } from "@/lib/time";

const Body = z.object({
  title: z.string().trim().min(1),
  description: z.string().trim().optional(),
  creditHours: z.coerce.number().min(0).max(1000),
  instructorName: z.string().trim().min(1),
  passThreshold: z.coerce.number().min(0).max(1),
  maxPlaybackRate: z.coerce.number().min(1).max(4),
  status: z.enum(["draft", "published", "archived"]),
});

export const POST: APIRoute = async ({ params, request, locals, redirect }) => {
  const db = getDb(locals.runtime.env);
  const id = params.id!;
  const form = Object.fromEntries(await request.formData());
  const parsed = Body.safeParse(form);
  if (!parsed.success) {
    return redirect(`/admin/content/${id}?done=Invalid+input`, 303);
  }
  const d = parsed.data;
  await db
    .update(schema.courses)
    .set({
      title: d.title,
      description: d.description || null,
      creditHours: d.creditHours,
      instructorName: d.instructorName,
      passThreshold: d.passThreshold,
      maxPlaybackRate: d.maxPlaybackRate,
      status: d.status,
      updatedAt: nowIso(),
    })
    .where(eq(schema.courses.id, id));
  return redirect(`/admin/content/${id}?done=Course+saved`, 303);
};
