/**
 * Single active playback DEVICE per user (compliance req 2, PLAN.md decision #3).
 *
 * NOT session revocation — a short-lived lease keyed to the user. Heartbeats
 * renew it; once it goes stale (expired) another device may steal it. While a
 * lease is live on one device, a different device is refused. The schema's
 * unique index on `user_id` enforces exactly one lease row per user.
 */
import { eq } from "drizzle-orm";
import type { Db } from "@/db/client";
import { schema } from "@/db/client";
import { newId } from "@/lib/crypto";
import { isoInSeconds, nowIso, isPast } from "@/lib/time";

export const LEASE_TTL_SECONDS = 90; // renewed by ~45s heartbeats; 2 missed = stale

export type Lease = typeof schema.playbackLeases.$inferSelect;

export type LeaseResult =
  | { ok: true; lease: Lease; stolen: boolean }
  | { ok: false; reason: "held_by_other_device"; heldLessonId: string };

/**
 * Acquire or renew the playback lease for `userId` on `deviceId`.
 *  - No live lease (none, or expired) → take it (stealing a stale one).
 *  - Live lease on the same device → renew (extend TTL, update lesson).
 *  - Live lease on a different device → refuse.
 */
export async function acquireOrRenewLease(
  db: Db,
  userId: string,
  lessonId: string,
  deviceId: string,
): Promise<LeaseResult> {
  const existing = await db
    .select()
    .from(schema.playbackLeases)
    .where(eq(schema.playbackLeases.userId, userId))
    .get();

  const expiresAt = isoInSeconds(LEASE_TTL_SECONDS);
  const now = nowIso();

  if (!existing) {
    const id = newId("lease");
    await db.insert(schema.playbackLeases).values({
      id,
      userId,
      lessonId,
      deviceId,
      acquiredAt: now,
      lastRenewedAt: now,
      expiresAt,
    });
    const lease = await db
      .select()
      .from(schema.playbackLeases)
      .where(eq(schema.playbackLeases.id, id))
      .get();
    return { ok: true, lease: lease!, stolen: false };
  }

  const live = !isPast(existing.expiresAt);
  if (live && existing.deviceId !== deviceId) {
    return {
      ok: false,
      reason: "held_by_other_device",
      heldLessonId: existing.lessonId,
    };
  }

  // Same device (renew) or stale lease (steal). Either way this device takes it.
  const stolen = existing.deviceId !== deviceId;
  await db
    .update(schema.playbackLeases)
    .set({
      lessonId,
      deviceId,
      lastRenewedAt: now,
      expiresAt,
      // reset the acquisition time only when ownership actually changes
      ...(stolen ? { acquiredAt: now } : {}),
    })
    .where(eq(schema.playbackLeases.userId, userId));

  const lease = await db
    .select()
    .from(schema.playbackLeases)
    .where(eq(schema.playbackLeases.userId, userId))
    .get();
  return { ok: true, lease: lease!, stolen };
}

/** Does this device currently hold a live lease? (Heartbeat guard.) */
export async function holdsLiveLease(
  db: Db,
  userId: string,
  deviceId: string,
): Promise<boolean> {
  const existing = await db
    .select()
    .from(schema.playbackLeases)
    .where(eq(schema.playbackLeases.userId, userId))
    .get();
  return !!existing && existing.deviceId === deviceId && !isPast(existing.expiresAt);
}

/** Release the lease if this device holds it (called on pause/unload). */
export async function releaseLease(
  db: Db,
  userId: string,
  deviceId: string,
): Promise<void> {
  const existing = await db
    .select()
    .from(schema.playbackLeases)
    .where(eq(schema.playbackLeases.userId, userId))
    .get();
  if (existing && existing.deviceId === deviceId) {
    await db
      .delete(schema.playbackLeases)
      .where(eq(schema.playbackLeases.userId, userId));
  }
}
