/**
 * Admin: publish or unpublish a blog post. Form POST with `action` =
 * "publish" | "unpublish". Access enforced in middleware (site_admin).
 */
import type { APIRoute } from "astro";
import { eq } from "drizzle-orm";
import { getDb, schema } from "@/db/client";

const nowIso = () => new Date().toISOString();

export const POST: APIRoute = async ({ params, request, locals, redirect }) => {
  const db = getDb(locals.runtime.env);
  const id = params.id!;
  const back = `/admin/blog/${id}`;

  const row = await db
    .select()
    .from(schema.blogPosts)
    .where(eq(schema.blogPosts.id, id))
    .get();
  if (!row) return redirect("/admin/blog", 303);

  const form = await request.formData();
  const action = String(form.get("action") ?? "");

  if (action === "publish") {
    if (!row.bodyMarkdown.trim() || !row.title.trim()) {
      return redirect(`${back}?msg=Add+a+title+and+body+before+publishing`, 303);
    }
    await db
      .update(schema.blogPosts)
      .set({
        status: "published",
        publishedAt: row.publishedAt ?? nowIso(),
        updatedAt: nowIso(),
      })
      .where(eq(schema.blogPosts.id, id));
    return redirect(`${back}?msg=Published`, 303);
  }

  if (action === "unpublish") {
    await db
      .update(schema.blogPosts)
      .set({ status: "draft", updatedAt: nowIso() })
      .where(eq(schema.blogPosts.id, id));
    return redirect(`${back}?msg=Moved+back+to+draft`, 303);
  }

  return redirect(back, 303);
};
