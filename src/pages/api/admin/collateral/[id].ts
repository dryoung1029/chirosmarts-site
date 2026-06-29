/**
 * Admin: save edits to a collateral draft (title + Markdown body).
 * Access enforced in middleware (site_admin).
 */
import type { APIRoute } from "astro";
import { eq } from "drizzle-orm";
import { getDb, schema } from "@/db/client";

const nowIso = () => new Date().toISOString();

export const POST: APIRoute = async ({ params, request, locals, redirect }) => {
  const db = getDb(locals.runtime.env);
  const id = params.id!;
  const back = `/admin/collateral/${id}`;

  const row = await db
    .select({ id: schema.courseCollateral.id })
    .from(schema.courseCollateral)
    .where(eq(schema.courseCollateral.id, id))
    .get();
  if (!row) return redirect("/admin/collateral", 303);

  const form = await request.formData();
  const title = String(form.get("title") ?? "").trim();
  const bodyMarkdown = String(form.get("bodyMarkdown") ?? "");

  if (!title) return redirect(`${back}?msg=Title+cannot+be+empty`, 303);

  await db
    .update(schema.courseCollateral)
    .set({ title, bodyMarkdown, updatedAt: nowIso() })
    .where(eq(schema.courseCollateral.id, id));

  return redirect(`${back}?msg=Saved`, 303);
};
