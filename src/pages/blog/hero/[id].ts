/**
 * Public serve route for a blog post's generated hero image (stored in R2).
 * Public so it works as an <img> source and an Open Graph image. The R2 key is
 * derived from the post id; the ?v= query string only busts caches on regen.
 */
import type { APIRoute } from "astro";

export const GET: APIRoute = async ({ params, locals }) => {
  const env = locals.runtime.env;
  const id = params.id!;
  const obj = await env.DOCS.get(`blog-hero/${id}.png`);
  if (!obj) return new Response("Not found", { status: 404 });
  return new Response(await obj.arrayBuffer(), {
    headers: {
      "content-type": obj.httpMetadata?.contentType ?? "image/png",
      "cache-control": "public, max-age=31536000, immutable",
    },
  });
};
