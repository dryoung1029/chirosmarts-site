/**
 * Admin: delete a blog post (draft or published). Access enforced in
 * middleware (site_admin).
 */
import type { APIRoute } from "astro";
import { eq } from "drizzle-orm";
import { getDb, schema } from "@/db/client";

export const POST: APIRoute = async ({ params, locals, redirect }) => {
  const db = getDb(locals.runtime.env);
  await db.delete(schema.blogPosts).where(eq(schema.blogPosts.id, params.id!));
  return redirect("/admin/blog?msg=Post+deleted", 303);
};
