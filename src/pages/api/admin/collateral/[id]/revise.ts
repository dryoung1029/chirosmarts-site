/**
 * Admin: apply a natural-language edit instruction to a collateral draft.
 * Operates on the on-screen draft (title + bodyMarkdown posted from the editor)
 * so unsaved edits + the instruction both apply, then saves the result.
 * Access enforced in middleware (site_admin).
 */
import type { APIRoute } from "astro";
import { eq } from "drizzle-orm";
import { getDb, schema } from "@/db/client";
import { reviseCollateral, NotConfiguredError } from "@/lib/collateral";

const nowIso = () => new Date().toISOString();

export const POST: APIRoute = async ({ params, request, locals, redirect }) => {
  const env = locals.runtime.env;
  const db = getDb(env);
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
  const instruction = String(form.get("instruction") ?? "").trim();

  if (!instruction) {
    return redirect(`${back}?msg=Type+an+edit+instruction+first`, 303);
  }

  try {
    const result = await reviseCollateral(
      env,
      bodyMarkdown,
      instruction,
      title || "Collateral",
    );
    await db
      .update(schema.courseCollateral)
      .set({
        title: result.title,
        bodyMarkdown: result.markdown,
        model: result.model,
        updatedAt: nowIso(),
      })
      .where(eq(schema.courseCollateral.id, id));
    return redirect(`${back}?msg=Edit+applied`, 303);
  } catch (err) {
    if (err instanceof NotConfiguredError) {
      return redirect(`${back}?msg=Set+ANTHROPIC_API_KEY+to+use+AI+edits`, 303);
    }
    return redirect(`${back}?msg=Edit+failed+please+try+again`, 303);
  }
};
