/**
 * Admin: download the combined course-manual Markdown source (the same content
 * compiled into the manual PDF, with `---` chapter breaks). Lets the owner keep
 * and tweak the editable source. GET ?courseId=...
 * Access enforced in middleware (site_admin).
 */
import type { APIRoute } from "astro";
import { and, asc, eq } from "drizzle-orm";
import { getDb, schema } from "@/db/client";
import { buildManualMarkdown } from "@/lib/pdf/collateral";

function slugify(s: string): string {
  return (
    s
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 50) || "course"
  );
}

export const GET: APIRoute = async ({ url, locals }) => {
  const db = getDb(locals.runtime.env);
  const courseId = url.searchParams.get("courseId") ?? "";
  if (!courseId) return new Response("Missing courseId", { status: 400 });

  const course = await db
    .select({ title: schema.courses.title })
    .from(schema.courses)
    .where(eq(schema.courses.id, courseId))
    .get();
  if (!course) return new Response("Not found", { status: 404 });

  const C = schema.courseCollateral;
  const items = await db
    .select()
    .from(C)
    .where(and(eq(C.courseId, courseId), eq(C.inManual, true)))
    .orderBy(asc(C.sortOrder))
    .all();
  const sections = items
    .filter((it) => it.bodyMarkdown.trim())
    .map((it) => ({ title: it.title, markdown: it.bodyMarkdown }));

  if (sections.length === 0) {
    return new Response("No items marked 'in manual'", { status: 422 });
  }

  const md = `# ${course.title} — Training Manual\n\n${buildManualMarkdown(
    sections,
    "\n---\n",
  )}`;

  return new Response(md, {
    headers: {
      "content-type": "text/markdown; charset=utf-8",
      "content-disposition": `attachment; filename="${slugify(
        course.title,
      )}-training-manual.md"`,
      "cache-control": "private, max-age=0, must-revalidate",
    },
  });
};
