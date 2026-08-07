/** Build-time-ish sitemap of public marketing routes + published courses. */
import type { APIRoute } from "astro";
import { getCollection } from "astro:content";
import { getDb, schema } from "@/db/client";
import { eq } from "drizzle-orm";
import { getSiteUrl } from "@/lib/env";
import { promoteDuePosts } from "@/lib/blog-schedule";

export const GET: APIRoute = async ({ locals }) => {
  const env = locals.runtime.env;
  const db = getDb(env);
  const base = getSiteUrl(env).replace(/\/$/, "");
  await promoteDuePosts(db);

  const courses = await db
    .select({ slug: schema.courses.slug })
    .from(schema.courses)
    .where(eq(schema.courses.status, "published"))
    .all();

  const posts = await db
    .select({ slug: schema.blogPosts.slug })
    .from(schema.blogPosts)
    .where(eq(schema.blogPosts.status, "published"))
    .all();

  // Content collections: every guide and every non-admin help article.
  const guides = await getCollection("guides");
  const help = (await getCollection("help")).filter(
    (a) => a.data.audience !== "admin",
  );

  const staticPaths = [
    "/",
    "/courses",
    "/clinics",
    "/renewal",
    "/about",
    "/blog",
    "/help",
    "/verify",
    "/terms",
    "/privacy",
  ];
  const urls = [
    ...staticPaths,
    ...guides.map((g) => `/guides/${g.id}`),
    ...help.map((h) => `/help/${h.id}`),
    ...courses.map((c) => `/courses/${c.slug}`),
    ...posts.map((p) => `/blog/${p.slug}`),
  ];

  const body =
    `<?xml version="1.0" encoding="UTF-8"?>\n` +
    `<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n` +
    urls.map((u) => `  <url><loc>${base}${u}</loc></url>`).join("\n") +
    `\n</urlset>\n`;

  return new Response(body, {
    headers: { "content-type": "application/xml; charset=utf-8" },
  });
};
