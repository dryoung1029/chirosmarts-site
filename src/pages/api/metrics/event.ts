/**
 * Lightweight CTA event beacon (downloads, signups) for public landing pages.
 * Fire-and-forget: always 204, never blocks or errors the page.
 *
 * Deliberately narrow — an allow-list of actions and a 120-char detail — so a
 * public endpoint can't be used to write arbitrary rows into the audit trail.
 */
import type { APIRoute } from "astro";
import { z } from "zod";
import { getDb } from "@/db/client";
import { logEvent } from "@/lib/events";
import { looksLikeBot } from "@/lib/metrics";

const schema = z.object({
  page: z.string().startsWith("/").max(120),
  action: z.enum(["download", "signup", "cta"]),
  detail: z.string().max(120).optional(),
});

const NO_CONTENT = new Response(null, { status: 204 });

export const POST: APIRoute = async ({ request, locals }) => {
  try {
    const env = locals.runtime.env;
    if (!env?.DB) return NO_CONTENT;
    const parsed = schema.safeParse(await request.json());
    if (!parsed.success) return NO_CONTENT;
    if (looksLikeBot(request.headers.get("user-agent") ?? "")) return NO_CONTENT;

    await logEvent(getDb(env), {
      userId: locals.user?.id ?? null,
      type: "cta_event",
      payload: {
        page: parsed.data.page,
        action: parsed.data.action,
        detail: parsed.data.detail ?? null,
      },
    });
  } catch {
    // Metrics must never surface an error to a visitor.
  }
  return NO_CONTENT;
};
