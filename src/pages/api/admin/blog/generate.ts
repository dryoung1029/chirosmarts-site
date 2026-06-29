/**
 * Admin: generate a new blog article draft from a topic (Article Studio).
 * Form POST (topic, keywords) → Claude → insert a draft blog_posts row →
 * redirect to the editor. Access enforced in middleware (site_admin).
 */
import type { APIRoute } from "astro";
import { eq } from "drizzle-orm";
import { getDb, schema } from "@/db/client";
import { newId } from "@/lib/crypto";
import { generateArticle, slugify, NotConfiguredError } from "@/lib/blog";

async function uniqueSlug(db: ReturnType<typeof getDb>, base: string): Promise<string> {
  let slug = base || "post";
  for (let n = 0; n < 50; n++) {
    const candidate = n === 0 ? slug : `${slug}-${n + 1}`;
    const hit = await db
      .select({ id: schema.blogPosts.id })
      .from(schema.blogPosts)
      .where(eq(schema.blogPosts.slug, candidate))
      .get();
    if (!hit) return candidate;
  }
  return `${slug}-${Date.now()}`;
}

export const POST: APIRoute = async ({ request, locals, redirect }) => {
  const env = locals.runtime.env;
  const db = getDb(env);
  const back = "/admin/blog";

  const form = await request.formData();
  const topic = String(form.get("topic") ?? "").trim();
  const keywords = String(form.get("keywords") ?? "").trim();
  if (!topic) return redirect(`${back}?msg=Enter+a+topic`, 303);

  try {
    const a = await generateArticle(env, { topic, keywords: keywords || undefined });
    const id = newId("post");
    await db.insert(schema.blogPosts).values({
      id,
      slug: await uniqueSlug(db, slugify(a.title)),
      title: a.title,
      excerpt: a.excerpt,
      seoDescription: a.seoDescription,
      bodyMarkdown: a.markdown,
      status: "draft",
      model: a.model,
    });
    return redirect(`/admin/blog/${id}?msg=Draft+generated`, 303);
  } catch (err) {
    if (err instanceof NotConfiguredError) {
      return redirect(`${back}?msg=Set+ANTHROPIC_API_KEY+to+generate+articles`, 303);
    }
    return redirect(`${back}?msg=Generation+failed+please+try+again`, 303);
  }
};
