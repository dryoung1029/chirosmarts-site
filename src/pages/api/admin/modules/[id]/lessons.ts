/** Admin: add a lesson to a module (access enforced in middleware). */
import type { APIRoute } from "astro";
import { z } from "zod";
import { eq } from "drizzle-orm";
import { getDb, schema } from "@/db/client";
import { newId } from "@/lib/crypto";

const Body = z.object({
  title: z.string().trim().min(1),
});

export const POST: APIRoute = async ({ params, request, locals, redirect }) => {
  const db = getDb(locals.runtime.env);
  const moduleId = params.id!;
  const module = await db
    .select({ courseId: schema.modules.courseId })
    .from(schema.modules)
    .where(eq(schema.modules.id, moduleId))
    .get();
  if (!module) return redirect("/admin/content", 303);
  const courseId = module.courseId;

  const form = Object.fromEntries(await request.formData());
  const parsed = Body.safeParse(form);
  if (!parsed.success) {
    return redirect(`/admin/content/${courseId}?done=Invalid+input`, 303);
  }

  // New lesson goes to the end of its module: max(position) + 1.
  const existing = await db
    .select({ position: schema.lessons.position })
    .from(schema.lessons)
    .where(eq(schema.lessons.moduleId, moduleId))
    .all();
  const nextPos = existing.reduce((m, r) => Math.max(m, r.position), 0) + 1;

  await db.insert(schema.lessons).values({
    id: newId("lsn"),
    moduleId,
    position: nextPos,
    title: parsed.data.title,
    // duration_seconds defaults to 0; attach a Stream video to set the real runtime.
  });
  return redirect(`/admin/content/${courseId}?done=Lesson+added#mod-${moduleId}`, 303);
};
