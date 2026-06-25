/**
 * Admin: publish a collateral draft as a student-facing PDF.
 * Renders the Markdown → branded PDF → R2, and upserts a `course_resources`
 * row (type `handout`, enrolled-only) so enrolled students see it on the course
 * page. Re-publishing overwrites the same R2 object + resource row (no dupes)
 * and bumps the collateral version. Access enforced in middleware (site_admin).
 */
import type { APIRoute } from "astro";
import { eq } from "drizzle-orm";
import { getDb, schema } from "@/db/client";
import { newId } from "@/lib/crypto";
import { renderCollateralPdf } from "@/lib/pdf/collateral";
import { TYPE_LABEL, type CollateralType } from "@/lib/collateral";

const nowIso = () => new Date().toISOString();

function slugify(s: string): string {
  return (
    s
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 60) || "collateral"
  );
}

export const POST: APIRoute = async ({ params, locals, redirect }) => {
  const env = locals.runtime.env;
  const db = getDb(env);
  const id = params.id!;
  const back = `/admin/collateral/${id}`;

  const row = await db
    .select()
    .from(schema.courseCollateral)
    .where(eq(schema.courseCollateral.id, id))
    .get();
  if (!row) return redirect("/admin/collateral", 303);
  if (!row.bodyMarkdown.trim()) {
    return redirect(`${back}?msg=Nothing+to+publish+yet`, 303);
  }

  const course = await db
    .select({ title: schema.courses.title })
    .from(schema.courses)
    .where(eq(schema.courses.id, row.courseId))
    .get();

  const typeLabel =
    TYPE_LABEL[row.type as CollateralType] ?? (row.type as string);
  const generatedDate = new Date().toLocaleDateString("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
    timeZone: "America/Los_Angeles",
  });

  let pdf: Uint8Array;
  try {
    pdf = await renderCollateralPdf({
      title: row.title,
      courseTitle: course?.title ?? "ChiroSmarts course",
      typeLabel,
      markdown: row.bodyMarkdown,
      generatedDate,
    });
  } catch {
    return redirect(`${back}?msg=PDF+render+failed+please+try+again`, 303);
  }

  // Reuse the existing resource on re-publish; otherwise mint a new one.
  const resourceId = row.resourceId ?? newId("res");
  const r2Key = `course-resources/${resourceId}`;
  const fileName = `${slugify(row.title)}.pdf`;

  await env.DOCS.put(r2Key, pdf, {
    httpMetadata: { contentType: "application/pdf" },
  });

  const existing = row.resourceId
    ? await db
        .select({ id: schema.courseResources.id })
        .from(schema.courseResources)
        .where(eq(schema.courseResources.id, row.resourceId))
        .get()
    : null;

  if (existing) {
    await db
      .update(schema.courseResources)
      .set({ title: row.title, fileName, type: "handout" })
      .where(eq(schema.courseResources.id, resourceId));
  } else {
    await db.insert(schema.courseResources).values({
      id: resourceId,
      courseId: row.courseId,
      type: "handout",
      title: row.title,
      fileName,
      contentType: "application/pdf",
      r2Key,
      visibility: "enrolled",
    });
  }

  await db
    .update(schema.courseCollateral)
    .set({
      status: "published",
      r2Key,
      resourceId,
      version: row.version + 1,
      publishedAt: nowIso(),
      updatedAt: nowIso(),
    })
    .where(eq(schema.courseCollateral.id, id));

  return redirect(`${back}?msg=Published+to+students`, 303);
};
