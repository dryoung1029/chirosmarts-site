/**
 * Admin: rename a collateral item (inline from the list). Form POST with `title`.
 * Access enforced in middleware (site_admin).
 */
import type { APIRoute } from "astro";
import { eq } from "drizzle-orm";
import { getDb, schema } from "@/db/client";

export const POST: APIRoute = async ({ params, request, locals, redirect }) => {
  const db = getDb(locals.runtime.env);
  const id = params.id!;
  const back = "/admin/collateral";

  const form = await request.formData();
  const title = String(form.get("title") ?? "").trim();
  if (!title) return redirect(`${back}?msg=Title+cannot+be+empty`, 303);

  await db
    .update(schema.courseCollateral)
    .set({ title, updatedAt: new Date().toISOString() })
    .where(eq(schema.courseCollateral.id, id));

  return redirect(`${back}?msg=Renamed`, 303);
};
