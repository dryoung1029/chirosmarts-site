/**
 * Admin: one-click "Improve" — rewrite a draft to satisfy the full SEO/AEO
 * checklist (direct answer, takeaways, FAQ, internal/external links, length)
 * and refresh its excerpt + meta description. Operates on the on-screen body.
 * Access enforced in middleware (site_admin).
 */
import type { APIRoute } from "astro";
import { eq } from "drizzle-orm";
import { getDb, schema } from "@/db/client";
import { improveArticle, deriveMeta, NotConfiguredError } from "@/lib/blog";

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
  if (!bodyMarkdown.trim()) return redirect(`${back}?msg=Nothing+to+improve+yet`, 303);

  try {
    const result = await improveArticle(env, bodyMarkdown);
    const meta = deriveMeta(result.markdown);
    await db
      .update(schema.blogPosts)
      .set({
        bodyMarkdown: result.markdown,
        excerpt: meta.excerpt,
        seoDescription: meta.seoDescription,
        model: result.model,
        updatedAt: nowIso(),
      })
      .where(eq(schema.blogPosts.id, id));
    return redirect(`${back}?msg=Improved+for+SEO+%2F+AEO`, 303);
  } catch (err) {
    if (err instanceof NotConfiguredError) {
      return redirect(`${back}?msg=Set+ANTHROPIC_API_KEY+to+use+Improve`, 303);
    }
    return redirect(`${back}?msg=Improve+failed+please+try+again`, 303);
  }
};
