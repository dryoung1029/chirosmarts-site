/**
 * Admin: suggest topical tags for a post (AI), merged with any existing tags.
 * Access enforced in middleware (site_admin).
 */
import type { APIRoute } from "astro";
import { eq } from "drizzle-orm";
import { getDb, schema } from "@/db/client";
import { suggestTags, NotConfiguredError } from "@/lib/blog";

const nowIso = () => new Date().toISOString();

export const POST: APIRoute = async ({ params, locals, redirect }) => {
  const env = locals.runtime.env;
  const db = getDb(env);
  const id = params.id!;
  const back = `/admin/blog/${id}`;

  const post = await db
    .select({ title: schema.blogPosts.title, tags: schema.blogPosts.tags })
    .from(schema.blogPosts)
    .where(eq(schema.blogPosts.id, id))
    .get();
  if (!post) return redirect("/admin/blog", 303);

  try {
    const suggested = await suggestTags(env, { title: post.title });
    if (suggested.length === 0) {
      return redirect(`${back}?msg=No+tags+suggested+%E2%80%94+set+ANTHROPIC_API_KEY+or+add+your+own`, 303);
    }
    const seen = new Set<string>();
    const merged = [...(post.tags ?? []), ...suggested]
      .map((t) => t.trim())
      .filter((t) => t && !seen.has(t.toLowerCase()) && seen.add(t.toLowerCase()))
      .slice(0, 6);
    await db
      .update(schema.blogPosts)
      .set({ tags: merged, updatedAt: nowIso() })
      .where(eq(schema.blogPosts.id, id));
    return redirect(`${back}?msg=Tags+suggested`, 303);
  } catch (err) {
    if (err instanceof NotConfiguredError) {
      return redirect(`${back}?msg=Set+ANTHROPIC_API_KEY+to+suggest+tags`, 303);
    }
    return redirect(`${back}?msg=Tag+suggestion+failed`, 303);
  }
};
