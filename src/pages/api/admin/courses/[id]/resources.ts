/** Admin: upload a course resource (e.g. the Vitals practice-log PDF). */
import type { APIRoute } from "astro";
import { eq } from "drizzle-orm";
import { getDb, schema } from "@/db/client";
import { addCourseResource } from "@/lib/course-resources";

const MAX_BYTES = 20 * 1024 * 1024; // 20 MB
const TYPES = ["practice_log_template", "handout", "other"] as const;

export const POST: APIRoute = async ({ params, request, locals, redirect }) => {
  const db = getDb(locals.runtime.env);
  const courseId = params.id!;
  const back = `/admin/content/${courseId}`;

  const course = await db
    .select({ id: schema.courses.id })
    .from(schema.courses)
    .where(eq(schema.courses.id, courseId))
    .get();
  if (!course) return redirect("/admin/content", 303);

  const form = await request.formData();
  const title = String(form.get("title") ?? "").trim();
  const typeRaw = String(form.get("type") ?? "other");
  const type = (TYPES as readonly string[]).includes(typeRaw)
    ? (typeRaw as (typeof TYPES)[number])
    : "other";
  const file = form.get("file");

  if (!title || !(file instanceof File) || file.size === 0) {
    return redirect(`${back}?done=Resource+upload+needs+a+title+and+file`, 303);
  }
  if (file.size > MAX_BYTES) {
    return redirect(`${back}?done=File+too+large+(max+20MB)`, 303);
  }

  await addCourseResource(locals.runtime.env, db, {
    courseId,
    type,
    title,
    fileName: file.name || "resource.pdf",
    contentType: file.type || "application/octet-stream",
    bytes: await file.arrayBuffer(),
  });
  return redirect(`${back}?done=Resource+uploaded`, 303);
};
