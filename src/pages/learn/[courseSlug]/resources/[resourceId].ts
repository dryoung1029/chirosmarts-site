/**
 * Download a course resource (e.g. the blank Vitals practice-log PDF).
 * Entitlement-gated: enrolled students only, unless the resource is `public`.
 */
import type { APIRoute } from "astro";
import { getDb } from "@/db/client";
import { getCourseBySlug } from "@/lib/courses";
import { hasActiveEnrollment } from "@/lib/entitlement";
import { getCourseResource, getCourseResourceBytes } from "@/lib/course-resources";

export const GET: APIRoute = async ({ params, locals, redirect }) => {
  const user = locals.user;
  if (!user) return redirect("/login", 302);
  const env = locals.runtime.env;
  const db = getDb(env);

  const course = await getCourseBySlug(db, params.courseSlug!);
  if (!course) return new Response("Not found", { status: 404 });

  const res = await getCourseResource(db, params.resourceId!);
  if (!res || res.courseId !== course.id) {
    return new Response("Not found", { status: 404 });
  }

  if (res.visibility !== "public") {
    const entitled = await hasActiveEnrollment(db, user.id, course.id);
    if (!entitled) return redirect(`/courses/${course.slug}`, 302);
  }

  const bytes = await getCourseResourceBytes(env, res.r2Key);
  if (!bytes) return new Response("File unavailable", { status: 404 });

  return new Response(bytes, {
    headers: {
      "content-type": res.contentType,
      "content-disposition": `attachment; filename="${res.fileName.replace(/"/g, "")}"`,
      "cache-control": "private, max-age=0, must-revalidate",
    },
  });
};
