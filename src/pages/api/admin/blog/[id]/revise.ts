/**
 * Admin: apply a natural-language edit instruction to a blog draft (on the
 * on-screen body), then save. Access enforced in middleware (site_admin).
 */
import type { APIRoute } from "astro";
import { eq } from "drizzle-orm";
import { getDb, schema } from "@/db/client";
import { reviseArticle, NotConfiguredError } from "@/lib/blog";

const nowIso = () => new Date().toISOString();

export const POST: APIRoute = async ({ params, request, locals, redirect }) => {
  const env = locals.runtime.env;
  const db = getDb(env);
  const id = params.id!;
  const back = `/admin/blog/${id}`;

  const row = await db
    .select({ id: schema.blogPosts.id })
    .from(schema.blogPosts)
    .where(eq(schema.blogPosts.id, id))
    .get();
  if (!row) return redirect("/admin/blog", 303);

  const form = await request.formData();
  const bodyMarkdown = String(form.get("bodyMarkdown") ?? "");
  const instruction = String(form.get("instruction") ?? "").trim();
  if (!instruction) return redirect(`${back}?msg=Type+an+edit+instruction+first`, 303);

  try {
    const result = await reviseArticle(env, bodyMarkdown, instruction);
    await db
      .update(schema.blogPosts)
      .set({ bodyMarkdown: result.markdown, model: result.model, updatedAt: nowIso() })
      .where(eq(schema.blogPosts.id, id));
    return redirect(`${back}?msg=Edit+applied`, 303);
  } catch (err) {
    if (err instanceof NotConfiguredError) {
      return redirect(`${back}?msg=Set+ANTHROPIC_API_KEY+to+use+AI+edits`, 303);
    }
    return redirect(`${back}?msg=Edit+failed+please+try+again`, 303);
  }
};
