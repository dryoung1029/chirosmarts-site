/**
 * Daily cron tick for lifecycle email flows. Cloudflare Pages has no native cron,
 * so an external scheduler (a Worker cron trigger, GitHub Actions, or any cron
 * service) hits this URL once a day with the shared secret:
 *
 *   GET /api/cron/flows  (header: x-cron-key: $CRON_SECRET)
 *
 * Authorized by the secret (not a session) — see middleware public paths.
 */
import type { APIRoute } from "astro";
import { getDb } from "@/db/client";
import { isCronAuthorized } from "@/lib/cron-auth";
import { runDailyFlows } from "@/lib/flows";
import { pruneRateLimits } from "@/lib/rate-limit";

export const GET: APIRoute = async ({ request, locals }) => {
  const env = locals.runtime.env;
  if (!isCronAuthorized(env, request)) {
    return new Response("unauthorized", { status: 401 });
  }
  const result = await runDailyFlows(env, getDb(env));
  await pruneRateLimits(getDb(env));
  return new Response(JSON.stringify({ ok: true, ...result }), {
    status: 200,
    headers: { "content-type": "application/json" },
  });
};
