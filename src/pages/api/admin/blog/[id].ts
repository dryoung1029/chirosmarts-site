/**
 * Admin: save edits to a blog post (title, slug, excerpt, meta, tags, body).
 * Access enforced in middleware (site_admin).
 */
import type { APIRoute } from "astro";
import { and, eq, ne } from "drizzle-orm";
import { getDb, schema } from "@/db/client";
import { slugify } from "@/lib/blog";

const nowIso = () => new Date().toISOString();

export const POST: APIRoute = async ({ params, request, locals, redirect }) => {
  const db = getDb(locals.runtime.env);
  const id = params.id!;
  const back = `/admin/blog/${id}`;

  const row = await db
    .select({ id: schema.blogPosts.id })
    .from(schema.blogPosts)
    .where(eq(schema.blogPosts.id, id))
    .get();
  if (!row) return redirect("/admin/blog", 303);

  const form = await request.formData();
  const title = String(form.get("title") ?? "").trim();
  let slug = slugify(String(form.get("slug") ?? "").trim() || title);
  const excerpt = String(form.get("excerpt") ?? "").trim();
  const seoDescription = String(form.get("seoDescription") ?? "").trim();
  const bodyMarkdown = String(form.get("bodyMarkdown") ?? "");
  const tags = String(form.get("tags") ?? "")
    .split(",")
    .map((t) => t.trim())
    .filter(Boolean);

  if (!title) return redirect(`${back}?msg=Title+is+required`, 303);

  // Ensure slug stays unique (excluding this post).
  const clash = await db
    .select({ id: schema.blogPosts.id })
    .from(schema.blogPosts)
    .where(and(eq(schema.blogPosts.slug, slug), ne(schema.blogPosts.id, id)))
    .get();
  if (clash) slug = `${slug}-${Date.now().toString(36)}`;

  await db
    .update(schema.blogPosts)
    .set({ title, slug, excerpt, seoDescription, bodyMarkdown, tags, updatedAt: nowIso() })
    .where(eq(schema.blogPosts.id, id));

  return redirect(`${back}?msg=Saved`, 303);
};
