/**
 * Admin: toggle whether a collateral item is included in the compiled course
 * manual. Form POST. Access enforced in middleware (site_admin).
 */
import type { APIRoute } from "astro";
import { eq } from "drizzle-orm";
import { getDb, schema } from "@/db/client";

export const POST: APIRoute = async ({ params, locals, redirect }) => {
  const db = getDb(locals.runtime.env);
  const id = params.id!;

  const row = await db
    .select({ inManual: schema.courseCollateral.inManual })
    .from(schema.courseCollateral)
    .where(eq(schema.courseCollateral.id, id))
    .get();
  if (!row) return redirect("/admin/collateral", 303);

  await db
    .update(schema.courseCollateral)
    .set({ inManual: !row.inManual })
    .where(eq(schema.courseCollateral.id, id));

  return redirect("/admin/collateral", 303);
};
