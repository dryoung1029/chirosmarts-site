/**
 * Admin: stream the actual PUBLISHED PDF (the R2 object students download), so
 * an admin can verify it without being enrolled in the course.
 * Access enforced in middleware (site_admin).
 */
import type { APIRoute } from "astro";
import { eq } from "drizzle-orm";
import { getDb, schema } from "@/db/client";

export const GET: APIRoute = async ({ params, locals }) => {
  const env = locals.runtime.env;
  const db = getDb(env);

  const row = await db
    .select()
    .from(schema.courseCollateral)
    .where(eq(schema.courseCollateral.id, params.id!))
    .get();
  if (!row || !row.r2Key) return new Response("Not published", { status: 404 });

  const obj = await env.DOCS.get(row.r2Key);
  if (!obj) return new Response("File unavailable", { status: 404 });

  return new Response(obj.body, {
    headers: {
      "content-type": "application/pdf",
      "content-disposition": 'inline; filename="published.pdf"',
      "cache-control": "private, max-age=0, must-revalidate",
    },
  });
};
