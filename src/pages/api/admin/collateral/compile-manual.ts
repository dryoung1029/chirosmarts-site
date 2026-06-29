/**
 * Admin: compile a course's "in manual" collateral (in sort order) into one
 * branded PDF manual, published as a single enrolled-only course download.
 * Re-compiling overwrites the same resource + R2 object (deterministic id).
 * Access enforced in middleware (site_admin).
 */
import type { APIRoute } from "astro";
import { and, asc, eq } from "drizzle-orm";
import { getDb, schema } from "@/db/client";
import { renderManualPdf } from "@/lib/pdf/collateral";

function slugify(s: string): string {
  return (
    s
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 50) || "course"
  );
}

export const POST: APIRoute = async ({ request, locals, redirect }) => {
  const env = locals.runtime.env;
  const db = getDb(env);
  const back = "/admin/collateral";

  const form = await request.formData();
  const courseId = String(form.get("courseId") ?? "").trim();
  if (!courseId) return redirect(back, 303);

  const course = await db
    .select({ title: schema.courses.title })
    .from(schema.courses)
    .where(eq(schema.courses.id, courseId))
    .get();
  if (!course) return redirect(back, 303);

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
    return redirect(`${back}?msg=Mark+at+least+one+item+%22in+manual%22+first`, 303);
  }

  let pdf: Uint8Array;
  try {
    pdf = await renderManualPdf({
      manualTitle: `${course.title} — Training Manual`,
      courseTitle: course.title,
      generatedDate: new Date().toLocaleDateString("en-US", {
        year: "numeric",
        month: "short",
        day: "numeric",
        timeZone: "America/Los_Angeles",
      }),
      sections,
    });
  } catch (err) {
    return redirect(
      `${back}?msg=Manual+render+failed%3A+${encodeURIComponent(
        err instanceof Error ? err.message : "unknown",
      )}`,
      303,
    );
  }

  // Deterministic resource per course so re-compiling overwrites in place.
  const resourceId = `manual-${courseId}`;
  const r2Key = `course-resources/${resourceId}`;
  const fileName = `${slugify(course.title)}-training-manual.pdf`;

  await env.DOCS.put(r2Key, pdf, {
    httpMetadata: { contentType: "application/pdf" },
  });

  const existing = await db
    .select({ id: schema.courseResources.id })
    .from(schema.courseResources)
    .where(eq(schema.courseResources.id, resourceId))
    .get();

  const title = `${course.title} — Training Manual`;
  if (existing) {
    await db
      .update(schema.courseResources)
      .set({ title, fileName, type: "handout" })
      .where(eq(schema.courseResources.id, resourceId));
  } else {
    await db.insert(schema.courseResources).values({
      id: resourceId,
      courseId,
      type: "handout",
      title,
      fileName,
      contentType: "application/pdf",
      r2Key,
      visibility: "enrolled",
    });
  }

  return redirect(
    `${back}?msg=Manual+compiled+(${sections.length}+sections)`,
    303,
  );
};
