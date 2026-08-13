/**
 * Cron tick for AI support triage. Cloudflare Pages has no native cron, so an
 * external scheduler hits this with the shared secret — the same pattern as
 * /api/cron/flows, but run more often (every 15–30 min) so students get a
 * timely answer:
 *
 *   GET /api/cron/support?key=$CRON_SECRET
 */
import type { APIRoute } from "astro";
import { getDb } from "@/db/client";
import { runSupportTriage } from "@/lib/support-runner";

export const GET: APIRoute = async ({ request, locals }) => {
  const env = locals.runtime.env;
  const key =
    new URL(request.url).searchParams.get("key") ??
    request.headers.get("x-cron-key") ??
    "";
  if (!env.CRON_SECRET || key !== env.CRON_SECRET) {
    return new Response("unauthorized", { status: 401 });
  }
  const result = await runSupportTriage(env, getDb(env));
  return new Response(JSON.stringify({ ok: true, ...result }), {
    status: 200,
    headers: { "content-type": "application/json" },
  });
};
