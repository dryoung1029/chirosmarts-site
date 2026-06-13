/** Admin: add a module to a course (access enforced in middleware). */
import type { APIRoute } from "astro";
import { z } from "zod";
import { eq } from "drizzle-orm";
import { getDb, schema } from "@/db/client";
import { newId } from "@/lib/crypto";

const Body = z.object({
  title: z.string().trim().min(1),
  description: z.string().trim().optional(),
  isFreePreview: z.coerce.boolean().optional(),
});

export const POST: APIRoute = async ({ params, request, locals, redirect }) => {
  const db = getDb(locals.runtime.env);
  const courseId = params.id!;
  const course = await db
    .select({ id: schema.courses.id })
    .from(schema.courses)
    .where(eq(schema.courses.id, courseId))
    .get();
  if (!course) return redirect("/admin/content", 303);

  const form = Object.fromEntries(await request.formData());
  const parsed = Body.safeParse(form);
  if (!parsed.success) {
    return redirect(`/admin/content/${courseId}?done=Invalid+input`, 303);
  }
  const d = parsed.data;

  // New module goes to the end: max(position) + 1.
  const existing = await db
    .select({ position: schema.modules.position })
    .from(schema.modules)
    .where(eq(schema.modules.courseId, courseId))
    .all();
  const nextPos = existing.reduce((m, r) => Math.max(m, r.position), 0) + 1;

  const newModuleId = newId("mod");
  await db.insert(schema.modules).values({
    id: newModuleId,
    courseId,
    position: nextPos,
    title: d.title,
    description: d.description || null,
    isFreePreview: !!d.isFreePreview,
  });
  return redirect(`/admin/content/${courseId}?done=Module+added#mod-${newModuleId}`, 303);
};
