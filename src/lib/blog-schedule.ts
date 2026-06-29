/**
 * Scheduling for blog posts. Cloudflare Pages has no native cron, so a scheduled
 * post is auto-published lazily: any public blog route calls promoteDuePosts()
 * before querying, which flips `scheduled` → `published` once its time passes.
 * publishedAt is set to the intended scheduled time, not the promotion instant.
 */
import { and, eq, lte, sql } from "drizzle-orm";
import { getDb, schema } from "@/db/client";

export async function promoteDuePosts(db: ReturnType<typeof getDb>): Promise<void> {
  const now = new Date().toISOString();
  await db
    .update(schema.blogPosts)
    .set({
      status: "published",
      publishedAt: sql`COALESCE(${schema.blogPosts.publishedAt}, ${schema.blogPosts.scheduledAt})`,
      updatedAt: now,
    })
    .where(and(eq(schema.blogPosts.status, "scheduled"), lte(schema.blogPosts.scheduledAt, now)));
}
