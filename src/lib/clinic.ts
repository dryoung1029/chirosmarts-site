/**
 * Clinic management (clinic-owner path).
 *
 * Model: a clinic owner buys a POOL of training seats and invites their CAs by
 * email. Each CA self-claims their own account — the invite link proves email
 * ownership the same way a magic link does, so claiming an invite both
 * authenticates the CA and joins them to the clinic.
 *
 * Seat accounting is RECOMPUTED, never stored as a counter: seats consumed =
 * CA members still in (invited|active). `clinics.seatsPurchased` is the only
 * stored figure (set by the seat-purchase flow — comped in test mode now,
 * Stripe in M3).
 */
import { and, asc, eq } from "drizzle-orm";
import type { Db } from "@/db/client";
import { schema } from "@/db/client";
import { newId, randomToken, sha256Hex } from "@/lib/crypto";
import { isoInSeconds, nowIso, isPast } from "@/lib/time";

const INVITE_TTL_SECONDS = 60 * 60 * 24 * 14; // 14 days

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

export interface RosterEntry {
  member: ClinicMember;
  legalName: string | null;
  intakeCompletedAt: string | null;
}

/** Roster joined with each claimed CA's user record, for the owner dashboard. */
export async function getRosterDetailed(
  db: Db,
  clinicId: string,
): Promise<RosterEntry[]> {
  const roster = await getRoster(db, clinicId);
  const entries: RosterEntry[] = [];
  for (const member of roster) {
    let legalName: string | null = null;
    let intakeCompletedAt: string | null = null;
    if (member.userId) {
      const u = await db
        .select({
          legalName: schema.users.legalName,
          intakeCompletedAt: schema.users.intakeCompletedAt,
        })
        .from(schema.users)
        .where(eq(schema.users.id, member.userId))
        .get();
      legalName = u?.legalName || null;
      intakeCompletedAt = u?.intakeCompletedAt ?? null;
    }
    entries.push({ member, legalName, intakeCompletedAt });
  }
  return entries;
}

export interface SeatSummary {
  purchased: number;
  consumed: number; // invited + active CAs
  available: number;
}

/** Recompute seat usage from membership rows. Never stored as a counter. */
export async function getSeatSummary(
  db: Db,
  clinic: Clinic,
): Promise<SeatSummary> {
  const roster = await getRoster(db, clinic.id);
  const consumed = roster.filter(
    (m) => m.status === "invited" || m.status === "active",
  ).length;
  return {
    purchased: clinic.seatsPurchased,
    consumed,
    available: Math.max(0, clinic.seatsPurchased - consumed),
  };
}

export type InviteResult =
  | { ok: true; member: ClinicMember; token: string }
  | { ok: false; reason: string };

/**
 * Invite a CA by email. Reserves a seat (the new `invited` row consumes one).
 * Returns the raw token so the caller can build/send the claim URL. Re-inviting
 * an email that already has a live (invited|active) row is a no-op error.
 */
export async function inviteCa(
  db: Db,
  clinic: Clinic,
  rawEmail: string,
): Promise<InviteResult> {
  const email = rawEmail.trim().toLowerCase();
  if (!email || !email.includes("@")) {
    return { ok: false, reason: "Please enter a valid email address." };
  }

  const roster = await getRoster(db, clinic.id);
  const live = roster.find(
    (m) =>
      m.email === email && (m.status === "invited" || m.status === "active"),
  );
  if (live) {
    return {
      ok: false,
      reason:
        live.status === "active"
          ? "That CA has already joined your clinic."
          : "That CA already has a pending invite.",
    };
  }

  const seats = await getSeatSummary(db, clinic);
  if (seats.available < 1) {
    return {
      ok: false,
      reason: "No seats available. Purchase more seats to invite another CA.",
    };
  }

  const token = randomToken();
  const inviteTokenHash = await sha256Hex(token);
  const id = newId("clm");
  await db.insert(schema.clinicMembers).values({
    id,
    clinicId: clinic.id,
    email,
    role: "ca",
    status: "invited",
    inviteTokenHash,
    inviteExpiresAt: isoInSeconds(INVITE_TTL_SECONDS),
  });

  const member = await db
    .select()
    .from(schema.clinicMembers)
    .where(eq(schema.clinicMembers.id, id))
    .get();
  return { ok: true, member: member!, token };
}

/** Revoke a pending invite (frees its seat). Only invited rows can be revoked. */
export async function revokeInvite(
  db: Db,
  clinicId: string,
  memberId: string,
): Promise<boolean> {
  const member = await db
    .select()
    .from(schema.clinicMembers)
    .where(eq(schema.clinicMembers.id, memberId))
    .get();
  if (!member || member.clinicId !== clinicId || member.status !== "invited") {
    return false;
  }
  await db
    .update(schema.clinicMembers)
    .set({ status: "removed", inviteTokenHash: null })
    .where(eq(schema.clinicMembers.id, memberId));
  return true;
}

export type AcceptResult =
  | { ok: true; clinicId: string; email: string; memberId: string }
  | { ok: false; reason: string };

/**
 * Validate an invite token. Marks the invite accepted and returns the email to
 * authenticate. Single-use + expiry enforced here. The caller is responsible for
 * creating/looking up the user, linking `userId`, and creating the session.
 */
export async function acceptInvite(
  db: Db,
  token: string,
): Promise<AcceptResult> {
  if (!token) return { ok: false, reason: "missing token" };
  const hash = await sha256Hex(token);

  const member = await db
    .select()
    .from(schema.clinicMembers)
    .where(eq(schema.clinicMembers.inviteTokenHash, hash))
    .get();

  if (!member) return { ok: false, reason: "This invite link is not valid." };
  if (member.status !== "invited") {
    return { ok: false, reason: "This invite has already been used." };
  }
  if (member.inviteExpiresAt && isPast(member.inviteExpiresAt)) {
    return { ok: false, reason: "This invite link has expired." };
  }

  return {
    ok: true,
    clinicId: member.clinicId,
    email: member.email,
    memberId: member.id,
  };
}

/** Link a claimed invite to the now-authenticated user and mark it active. */
export async function linkInviteToUser(
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
    .where(
      and(
        eq(schema.clinicMembers.id, memberId),
        eq(schema.clinicMembers.status, "invited"),
      ),
    );
}

/** Grant seats to a clinic (test-mode comp; Stripe-backed in M3). */
export async function grantSeats(
  db: Db,
  clinic: Clinic,
  count: number,
): Promise<void> {
  await db
    .update(schema.clinics)
    .set({
      seatsPurchased: clinic.seatsPurchased + count,
      updatedAt: nowIso(),
    })
    .where(eq(schema.clinics.id, clinic.id));
}
