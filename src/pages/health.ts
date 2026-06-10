import type { APIRoute } from "astro";

// Liveness/readiness probe: confirms SSR is running, SITE_URL is wired, and
// the D1 binding is reachable. Returns 200 only if the DB query succeeds.
export const GET: APIRoute = async ({ locals }) => {
  const env = locals.runtime?.env;
  const checks: Record<string, unknown> = {
    ssr: true,
    siteUrlPresent: Boolean(env?.SITE_URL),
    db: "unknown",
  };

  let ok = true;
  try {
    if (!env?.DB) throw new Error("DB binding missing");
    await env.DB.prepare("select 1").first();
    checks.db = "ok";
  } catch (e) {
    ok = false;
    checks.db = `error: ${(e as Error).message}`;
  }

  return new Response(JSON.stringify({ ok, checks }, null, 2), {
    status: ok ? 200 : 503,
    headers: { "content-type": "application/json" },
  });
};
