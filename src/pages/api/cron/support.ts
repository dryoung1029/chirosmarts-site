/**
 * Cron tick for AI support triage. Cloudflare Pages has no native cron, so an
 * external scheduler hits this with the shared secret — the same pattern as
 * /api/cron/flows, but run more often (every 15–30 min) so students get a
 * timely answer:
 *
 *   GET /api/cron/support  (header: x-cron-key: $CRON_SECRET)
 */
import type { APIRoute } from "astro";
import { getDb } from "@/db/client";
import { isCronAuthorized } from "@/lib/cron-auth";
import { runSupportTriage } from "@/lib/support-runner";

export const GET: APIRoute = async ({ request, locals }) => {
  const env = locals.runtime.env;
  if (!isCronAuthorized(env, request)) {
    return new Response("unauthorized", { status: 401 });
  }
  const result = await runSupportTriage(env, getDb(env));
  return new Response(JSON.stringify({ ok: true, ...result }), {
    status: 200,
    headers: { "content-type": "application/json" },
  });
};
