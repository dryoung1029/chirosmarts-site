/**
 * Run AI triage on demand from the support queue. Admin-session authorized, so
 * it works without the cron secret — the same work the cron does, just when you
 * press the button.
 *
 * Deliberately a SMALL batch: each request costs one model call of several
 * seconds, and this runs inside a page request the owner is watching. Press it
 * again to keep going; the response says how many are left.
 */
import type { APIRoute } from "astro";
import { eq, sql } from "drizzle-orm";
import { getDb, schema } from "@/db/client";
import { runSupportTriage } from "@/lib/support-runner";

const BATCH = 3;

export const POST: APIRoute = async ({ locals }) => {
  const env = locals.runtime.env;
  const db = getDb(env);

  if (!env.ANTHROPIC_API_KEY) {
    return new Response(null, {
      status: 303,
      headers: {
        location: `/admin/support?msg=${encodeURIComponent("ANTHROPIC_API_KEY isn't set — nothing can be drafted.")}`,
      },
    });
  }

  const result = await runSupportTriage(env, db, BATCH);

  const remaining = Number(
    (
      await db
        .select({ c: sql<number>`count(*)` })
        .from(schema.supportRequests)
        .where(eq(schema.supportRequests.status, "new"))
        .get()
    )?.c ?? 0,
  );

  const parts: string[] = [];
  if (result.autoSent) parts.push(`${result.autoSent} auto-sent`);
  if (result.awaitingReview) parts.push(`${result.awaitingReview} drafted for review`);
  if (result.escalated) parts.push(`${result.escalated} flagged for you`);
  if (!parts.length) parts.push("nothing to triage");
  if (remaining > 0) parts.push(`${remaining} still queued — press again`);
  if (result.errors.length) parts.push(`errors: ${result.errors.join("; ")}`);

  return new Response(null, {
    status: 303,
    headers: {
      location: `/admin/support?msg=${encodeURIComponent(parts.join(" · "))}`,
    },
  });
};
