/**
 * Admin: delete a collateral draft. If it was published, also removes the
 * student-facing course_resources row and its R2 object so nothing is orphaned.
 * Access enforced in middleware (site_admin).
 */
import type { APIRoute } from "astro";
import { eq } from "drizzle-orm";
import { getDb, schema } from "@/db/client";

export const POST: APIRoute = async ({ params, locals, redirect }) => {
  const env = locals.runtime.env;
  const db = getDb(env);
  const id = params.id!;

  const row = await db
    .select()
    .from(schema.courseCollateral)
    .where(eq(schema.courseCollateral.id, id))
    .get();
  if (!row) return redirect("/admin/collateral", 303);

  // Delete the collateral row FIRST: it holds the FK (resource_id) to
  // course_resources, so the parent resource can't be removed while it points
  // at it. Then tear down the published artifact (resource row + R2 object).
  await db
    .delete(schema.courseCollateral)
    .where(eq(schema.courseCollateral.id, id));

  if (row.resourceId) {
    await db
      .delete(schema.courseResources)
      .where(eq(schema.courseResources.id, row.resourceId));
    if (row.r2Key) {
      try {
        await env.DOCS.delete(row.r2Key);
      } catch {
        /* best-effort */
      }
    }
  }

  return redirect("/admin/collateral?msg=Collateral+deleted", 303);
};
