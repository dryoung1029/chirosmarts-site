/** Admin: update lesson metadata (access enforced in middleware). */
import type { APIRoute } from "astro";
import { z } from "zod";
import { eq } from "drizzle-orm";
import { getDb, schema } from "@/db/client";

const Body = z.object({
  title: z.string().trim().min(1),
  position: z.coerce.number().int().min(0),
});

export const POST: APIRoute = async ({ params, request, locals, redirect }) => {
  const db = getDb(locals.runtime.env);
  const id = params.id!;
  const lesson = await db
    .select({ moduleId: schema.lessons.moduleId })
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

  const form = Object.fromEntries(await request.formData());
  const parsed = Body.safeParse(form);
  if (!parsed.success) {
    return redirect(`/admin/content/${courseId}?done=Invalid+input`, 303);
  }
  const d = parsed.data;
  await db
    .update(schema.lessons)
    .set({ title: d.title, position: d.position })
    .where(eq(schema.lessons.id, id));
  return redirect(`/admin/content/${courseId}?done=Lesson+saved`, 303);
};
