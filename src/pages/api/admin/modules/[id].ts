/** Admin: update module metadata (access enforced in middleware). */
import type { APIRoute } from "astro";
import { z } from "zod";
import { eq } from "drizzle-orm";
import { getDb, schema } from "@/db/client";

const Body = z.object({
  title: z.string().trim().min(1),
  description: z.string().trim().optional(),
  position: z.coerce.number().int().min(0),
  isFreePreview: z.coerce.boolean().optional(),
});

export const POST: APIRoute = async ({ params, request, locals, redirect }) => {
  const db = getDb(locals.runtime.env);
  const id = params.id!;
  const module = await db
    .select({ courseId: schema.modules.courseId })
    .from(schema.modules)
    .where(eq(schema.modules.id, id))
    .get();
  if (!module) return redirect("/admin/content", 303);

  const form = Object.fromEntries(await request.formData());
  const parsed = Body.safeParse(form);
  if (!parsed.success) {
    return redirect(`/admin/content/${module.courseId}?done=Invalid+input`, 303);
  }
  const d = parsed.data;
  await db
    .update(schema.modules)
    .set({
      title: d.title,
      description: d.description || null,
      position: d.position,
      isFreePreview: !!d.isFreePreview, // unchecked box → field absent → false
    })
    .where(eq(schema.modules.id, id));
  return redirect(`/admin/content/${module.courseId}?done=Module+saved`, 303);
};
