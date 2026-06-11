/** Admin: delete a course resource (row + R2 object). */
import type { APIRoute } from "astro";
import { getDb } from "@/db/client";
import { deleteCourseResource } from "@/lib/course-resources";

export const POST: APIRoute = async ({ params, locals, redirect }) => {
  const db = getDb(locals.runtime.env);
  const courseId = await deleteCourseResource(locals.runtime.env, db, params.id!);
  return redirect(
    courseId ? `/admin/content/${courseId}?done=Resource+deleted` : "/admin/content",
    303,
  );
};
