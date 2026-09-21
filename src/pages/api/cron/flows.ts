/**
 * Daily cron tick for lifecycle email flows. Cloudflare Pages has no native cron,
 * so an external scheduler (a Worker cron trigger, GitHub Actions, or any cron
 * service) hits this URL once a day with the shared secret:
 *
 *   GET /api/cron/flows?key=$CRON_SECRET
 *
 * Authorized by the secret (not a session) — see middleware public paths.
 */
import type { APIRoute } from "astro";
import { getDb } from "@/db/client";
import { runDailyFlows } from "@/lib/flows";

export const GET: APIRoute = async ({ request, locals }) => {
  const env = locals.runtime.env;
  const key = new URL(request.url).searchParams.get("key") ?? request.headers.get("x-cron-key") ?? "";
  if (!env.CRON_SECRET || key !== env.CRON_SECRET) {
    return new Response("unauthorized", { status: 401 });
  }
  const result = await runDailyFlows(env, getDb(env));
  return new Response(JSON.stringify({ ok: true, ...result }), {
    status: 200,
    headers: { "content-type": "application/json" },
  });
};
