/**
 * Admin: download a collateral draft's Markdown source (so edits/tweaks can be
 * made offline). Access enforced in middleware (site_admin).
 */
import type { APIRoute } from "astro";
import { eq } from "drizzle-orm";
import { getDb, schema } from "@/db/client";

function slugify(s: string): string {
  return (
    s
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 60) || "collateral"
  );
}

export const GET: APIRoute = async ({ params, locals }) => {
  const db = getDb(locals.runtime.env);
  const row = await db
    .select()
    .from(schema.courseCollateral)
    .where(eq(schema.courseCollateral.id, params.id!))
    .get();
  if (!row) return new Response("Not found", { status: 404 });

  return new Response(row.bodyMarkdown, {
    headers: {
      "content-type": "text/markdown; charset=utf-8",
      "content-disposition": `attachment; filename="${slugify(row.title)}.md"`,
      "cache-control": "private, max-age=0, must-revalidate",
    },
  });
};
