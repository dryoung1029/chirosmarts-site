/**
 * Pageview beacon target (navigator.sendBeacon from the public layouts).
 * Fire-and-forget: always 204, never blocks or errors the page. Drops anything
 * off the public surface, obvious bots, and admin sessions (so the owner's own
 * browsing never inflates the numbers). See src/lib/metrics.ts for the
 * privacy-first design.
 */
import type { APIRoute } from "astro";
import { z } from "zod";
import { getDb } from "@/db/client";
import { isAdmin } from "@/lib/admin";
import { isTrackablePath, looksLikeBot, recordPageView } from "@/lib/metrics";

const schema = z.object({
  path: z.string().startsWith("/").max(200),
  referrer: z.string().max(500).default(""),
  utm_source: z.string().max(100).optional(),
  utm_medium: z.string().max(100).optional(),
  utm_campaign: z.string().max(100).optional(),
});

const NO_CONTENT = new Response(null, { status: 204 });

export const POST: APIRoute = async ({ request, locals }) => {
  try {
    const env = locals.runtime.env;
    if (!env?.DB) return NO_CONTENT;

    // sendBeacon posts text/plain — parse the body as JSON regardless of type.
    const parsed = schema.safeParse(await request.json());
    if (!parsed.success) return NO_CONTENT;
    const d = parsed.data;

    // Strip query/hash so paths aggregate cleanly.
    const path = d.path.split("?")[0].split("#")[0];
    if (!isTrackablePath(path)) return NO_CONTENT;

    const ua = request.headers.get("user-agent") ?? "";
    if (looksLikeBot(ua)) return NO_CONTENT;
    if (isAdmin(env, locals.user)) return NO_CONTENT;

    const cf = (request as { cf?: { country?: string } }).cf;
    await recordPageView(getDb(env), {
      path,
      referrer: d.referrer,
      utmSource: d.utm_source ?? null,
      utmMedium: d.utm_medium ?? null,
      utmCampaign: d.utm_campaign ?? null,
      country: cf?.country ?? request.headers.get("cf-ipcountry"),
      device: /Mobi|Android|iPhone|iPad/i.test(ua) ? "mobile" : "desktop",
      siteHost: new URL(request.url).hostname,
    });
  } catch {
    // Metrics must never surface an error to a visitor.
  }
  return NO_CONTENT;
};
