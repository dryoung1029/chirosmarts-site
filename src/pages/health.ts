import type { APIRoute } from "astro";
import { getDb } from "@/db/client";
import { isCronAuthorized } from "@/lib/cron-auth";
import { checkSchemaDrift } from "@/lib/schema-drift";

// Liveness/readiness probe: confirms SSR is running, SITE_URL is wired, and
// the D1 binding is reachable. Returns 200 only if the DB query succeeds.
//
// `build` is the git commit this deploy was built from, so the post-deploy
// smoke test (.github/workflows/smoke.yml) can wait for ITS commit to be live.
//
// Deep mode (`?deep=1` + the `x-cron-key` header) also checks the database
// against this build's schema and migrations (src/lib/schema-drift.ts) and
// returns 503 on any drift. Gated because it names tables and columns.
export const GET: APIRoute = async ({ locals, request, url }) => {
  const env = locals.runtime?.env;
  const checks: Record<string, unknown> = {
    ssr: true,
    build: __BUILD_SHA__,
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

  if (ok && url.searchParams.get("deep") === "1") {
    if (!isCronAuthorized(env, request)) {
      return new Response(JSON.stringify({ ok: false, error: "deep check needs x-cron-key" }), {
        status: 401,
        headers: { "content-type": "application/json" },
      });
    }
    const drift = await checkSchemaDrift(getDb(env), env.DB);
    checks.schema = drift;
    ok = drift.ok;
  }

  return new Response(JSON.stringify({ ok, checks }, null, 2), {
    status: ok ? 200 : 503,
    headers: { "content-type": "application/json", "cache-control": "no-store" },
  });
};
