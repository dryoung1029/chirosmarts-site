/**
 * Admin: render the SAVED collateral draft to a PDF and return it inline (a
 * preview, no publish). Access enforced in middleware (site_admin).
 */
import type { APIRoute } from "astro";
import { eq } from "drizzle-orm";
import { getDb, schema } from "@/db/client";
import { renderCollateralPdf } from "@/lib/pdf/collateral";
import { TYPE_LABEL, type CollateralType } from "@/lib/collateral";

export const GET: APIRoute = async ({ params, locals }) => {
  const env = locals.runtime.env;
  const db = getDb(env);

  const row = await db
    .select()
    .from(schema.courseCollateral)
    .where(eq(schema.courseCollateral.id, params.id!))
    .get();
  if (!row) return new Response("Not found", { status: 404 });

  const course = await db
    .select({ title: schema.courses.title })
    .from(schema.courses)
    .where(eq(schema.courses.id, row.courseId))
    .get();

  const pdf = await renderCollateralPdf({
    title: row.title,
    courseTitle: course?.title ?? "ChiroSmarts course",
    typeLabel: TYPE_LABEL[row.type as CollateralType] ?? (row.type as string),
    markdown: row.bodyMarkdown,
    generatedDate: new Date().toLocaleDateString("en-US", {
      year: "numeric",
      month: "short",
      day: "numeric",
      timeZone: "America/Los_Angeles",
    }),
  });

  return new Response(pdf as unknown as BodyInit, {
    headers: {
      "content-type": "application/pdf",
      "content-disposition": 'inline; filename="preview.pdf"',
      "cache-control": "private, max-age=0, must-revalidate",
    },
  });
};
