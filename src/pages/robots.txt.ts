/** robots.txt — dynamic so the Sitemap line always uses the live SITE_URL
 * (never hard-code URLs). Auto-switches when the custom domain attaches. */
import type { APIRoute } from "astro";
import { getSiteUrl } from "@/lib/env";

export const GET: APIRoute = ({ locals }) => {
  const base = getSiteUrl(locals.runtime.env).replace(/\/$/, "");
  const body =
    [
      "User-agent: *",
      "Allow: /",
      "Disallow: /dashboard",
      "Disallow: /admin",
      "Disallow: /learn",
      "Disallow: /api",
      "Disallow: /intake",
      "",
      `Sitemap: ${base}/sitemap.xml`,
    ].join("\n") + "\n";
  return new Response(body, {
    headers: { "content-type": "text/plain; charset=utf-8" },
  });
};
