/**
 * Clinic identity (clinic-owner path).
 *
 * Model: a clinic owner runs a clinic and onboards their CAs. Each CA self-claims
 * their own account — a seat-assignment invite link proves email ownership the
 * same way a magic link does, so claiming both authenticates the CA and links
 * their membership.
 *
 * This module owns the clinic + member IDENTITY (one `clinic_members` row per
 * person per clinic). Seat accounting — per-course pools and per-(person,course)
 * assignments — lives in `seat-pools.ts` (Phase 4). `clinics.seatsPurchased` is
 * deprecated (kept for D1-safety, backfilled into a pool, then unused).
 */
import { and, asc, desc, eq } from "drizzle-orm";
import type { Db } from "@/db/client";
import { schema } from "@/db/client";
import { newId } from "@/lib/crypto";
import { nowIso } from "@/lib/time";

export type Clinic = typeof schema.clinics.$inferSelect;
export type ClinicMember = typeof schema.clinicMembers.$inferSelect;

/** The clinic owned by a given user, or null. */
export async function getClinicForOwner(
  db: Db,
  ownerUserId: string,
): Promise<Clinic | null> {
  const row = await db
    .select()
    .from(schema.clinics)
    .where(eq(schema.clinics.ownerUserId, ownerUserId))
    .get();
  return row ?? null;
}

/** A claimed CA's clinic membership (their staff link), or null. */
export interface CaMembership {
  clinic: Clinic;
  member: ClinicMember;
}

/**
 * The clinic a user belongs to as a CA (an active, claimed staff membership), or
 * null. Used to show clinic context on a staff member's own dashboard.
 */
export async function getCaMembershipForUser(
  db: Db,
  userId: string,
): Promise<CaMembership | null> {
  const member = await db
    .select()
    .from(schema.clinicMembers)
    .where(
      and(
        eq(schema.clinicMembers.userId, userId),
        eq(schema.clinicMembers.role, "ca"),
        eq(schema.clinicMembers.status, "active"),
      ),
    )
    .get();
  if (!member) return null;
  const clinic = await db
    .select()
    .from(schema.clinics)
    .where(eq(schema.clinics.id, member.clinicId))
    .get();
  return clinic ? { clinic, member } : null;
}

/**
 * Create a clinic for an owner if they don't already have one. Idempotent per
 * owner. Also records the owner's own `owner` membership row.
 */
export async function createClinicForOwner(
  db: Db,
  ownerUserId: string,
  ownerEmail: string,
  name: string,
): Promise<Clinic> {
  const existing = await getClinicForOwner(db, ownerUserId);
  if (existing) return existing;

  const id = newId("clin");
  await db.insert(schema.clinics).values({ id, ownerUserId, name });

  await db.insert(schema.clinicMembers).values({
    id: newId("clm"),
    clinicId: id,
    userId: ownerUserId,
    email: ownerEmail.trim().toLowerCase(),
    role: "owner",
    status: "active",
    claimedAt: nowIso(),
  });

  return (await getClinicForOwner(db, ownerUserId))!;
}

/** All CA members of a clinic (excludes the owner row), ordered by invite time. */
export async function getRoster(
  db: Db,
  clinicId: string,
): Promise<ClinicMember[]> {
  const rows = await db
    .select()
    .from(schema.clinicMembers)
    .where(eq(schema.clinicMembers.clinicId, clinicId))
    .orderBy(asc(schema.clinicMembers.invitedAt))
    .all();
  return rows.filter((m) => m.role === "ca");
}

/**
 * The live CA-member identity for an email in a clinic, or null. Prefers an
 * already-`active` (claimed) row, then a still-`invited` one, then the most
 * recent. Used to decide whether a seat assignment can go straight to `active`
 * (the CA is already in the clinic) or needs an invite.
 */
export async function findCaMemberByEmail(
  db: Db,
  clinicId: string,
  rawEmail: string,
): Promise<ClinicMember | null> {
  const email = rawEmail.trim().toLowerCase();
  const rows = await db
    .select()
    .from(schema.clinicMembers)
    .where(
      and(
        eq(schema.clinicMembers.clinicId, clinicId),
        eq(schema.clinicMembers.email, email),
        eq(schema.clinicMembers.role, "ca"),
      ),
    )
    .orderBy(desc(schema.clinicMembers.invitedAt))
    .all();
  if (rows.length === 0) return null;
  return (
    rows.find((m) => m.status === "active") ??
    rows.find((m) => m.status === "invited") ??
    rows[0]
  );
}

/**
 * Return the CA-member identity for an email, creating an `invited` identity row
 * if none exists. One row per person per clinic — re-granting courses reuses it.
 */
export async function ensureCaMember(
  db: Db,
  clinicId: string,
  rawEmail: string,
): Promise<ClinicMember> {
  const email = rawEmail.trim().toLowerCase();
  const existing = await findCaMemberByEmail(db, clinicId, email);
  if (existing && existing.status !== "removed") return existing;

  const id = newId("clm");
  await db.insert(schema.clinicMembers).values({
    id,
    clinicId,
    email,
    role: "ca",
    status: "invited",
  });
  return (await db
    .select()
    .from(schema.clinicMembers)
    .where(eq(schema.clinicMembers.id, id))
    .get())!;
}

/** Link a claimed member identity to the now-authenticated user; mark active. */
export async function linkMemberToUser(
  db: Db,
  memberId: string,
  userId: string,
): Promise<void> {
  await db
    .update(schema.clinicMembers)
    .set({
      userId,
      status: "active",
      claimedAt: nowIso(),
      inviteTokenHash: null,
    })
    .where(eq(schema.clinicMembers.id, memberId));
}
