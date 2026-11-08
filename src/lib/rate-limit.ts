/**
 * Fixed-window rate limiting for the public, unauthenticated endpoints that
 * send email or spend money. Two layers, used together:
 *
 *  - PER-IP (here): a coarse cap against scripted spraying across many
 *    addresses. Generous on purpose: a room of CE attendees on one venue
 *    Wi-Fi scanning the Talking to Pain QR code all share one IP, as does a
 *    clinic signing its CAs in on the same morning.
 *  - PER-ADDRESS (in each endpoint, from data it already stores): the precise
 *    cap against bombing one inbox.
 *
 * The raw IP is never stored: the key hashes it together with the window
 * start, so each window gets a fresh, unlinkable row. Fails OPEN on any
 * storage error (including the table not being migrated yet). A limiter must
 * never be the reason a student can't sign in.
 */
import { sql } from "drizzle-orm";
import type { Db } from "@/db/client";
import { schema } from "@/db/client";
import { sha256Hex } from "@/lib/crypto";
import { isMissingTable } from "@/lib/db-errors";

export const LIMITS = {
  magic_link: { limit: 30, windowSec: 3600 },
  lead_capture: { limit: 60, windowSec: 3600 },
  help_contact: { limit: 10, windowSec: 3600 },
  metrics: { limit: 600, windowSec: 3600 },
} as const;

export type Bucket = keyof typeof LIMITS;

/** Count one request against `bucket` for this client. Returns false once
 *  the client is over the limit for the current window. */
export async function allowRequest(db: Db, request: Request, bucket: Bucket): Promise<boolean> {
  // Only Cloudflare's edge sets this; absent in local dev → don't limit.
  const ip = request.headers.get("cf-connecting-ip");
  if (!ip) return true;

  const { limit, windowSec } = LIMITS[bucket];
  const now = Math.floor(Date.now() / 1000);
  const windowStart = now - (now % windowSec);
  const key = `${bucket}:${(await sha256Hex(`${ip}|${windowStart}`)).slice(0, 32)}`;

  try {
    const row = await db
      .insert(schema.rateLimits)
      .values({ key, windowStart, count: 1 })
      .onConflictDoUpdate({
        target: schema.rateLimits.key,
        set: { count: sql`${schema.rateLimits.count} + 1` },
      })
      .returning({ count: schema.rateLimits.count })
      .get();
    return (row?.count ?? 1) <= limit;
  } catch (e) {
    if (!isMissingTable(e)) console.error("[rate-limit] failed open", e);
    return true;
  }
}

/** Drop finished windows. Called from the daily flows cron. */
export async function pruneRateLimits(db: Db): Promise<void> {
  const cutoff = Math.floor(Date.now() / 1000) - 2 * 86400;
  try {
    await db.delete(schema.rateLimits).where(sql`${schema.rateLimits.windowStart} < ${cutoff}`);
  } catch (e) {
    if (!isMissingTable(e)) console.error("[rate-limit] prune failed", e);
  }
}
