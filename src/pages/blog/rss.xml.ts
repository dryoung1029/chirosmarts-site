/** RSS 2.0 feed of published blog articles. */
import type { APIRoute } from "astro";
import { getDb, schema } from "@/db/client";
import { desc, eq } from "drizzle-orm";
import { getSiteUrl } from "@/lib/env";

const esc = (s: string) =>
  s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");

export const GET: APIRoute = async ({ locals }) => {
  const env = locals.runtime.env;
  const db = getDb(env);
  const base = getSiteUrl(env).replace(/\/$/, "");

  const posts = await db
    .select()
    .from(schema.blogPosts)
    .where(eq(schema.blogPosts.status, "published"))
    .orderBy(desc(schema.blogPosts.publishedAt))
    .all();

  const items = posts
    .map((p) => {
      const url = `${base}/blog/${p.slug}`;
      const date = p.publishedAt ? new Date(p.publishedAt).toUTCString() : "";
      return (
        `    <item>\n` +
        `      <title>${esc(p.title)}</title>\n` +
        `      <link>${url}</link>\n` +
        `      <guid isPermaLink="true">${url}</guid>\n` +
        (date ? `      <pubDate>${date}</pubDate>\n` : "") +
        (p.excerpt ? `      <description>${esc(p.excerpt)}</description>\n` : "") +
        `    </item>`
      );
    })
    .join("\n");

  const body =
    `<?xml version="1.0" encoding="UTF-8"?>\n` +
    `<rss version="2.0">\n` +
    `  <channel>\n` +
    `    <title>ChiroSmarts Blog</title>\n` +
    `    <link>${base}/blog</link>\n` +
    `    <description>Practical guidance, compliance tips, and front-desk skills for chiropractic assistants.</description>\n` +
    (items ? items + "\n" : "") +
    `  </channel>\n` +
    `</rss>\n`;

  return new Response(body, {
    headers: { "content-type": "application/xml; charset=utf-8" },
  });
};
