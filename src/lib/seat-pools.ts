/**
 * Phase 4 — per-course clinic seat pools.
 *
 * A clinic owner buys a POOL of seats for a SPECIFIC course
 * (`clinic_seat_pools(clinicId, courseId, seatsPurchased)`), then assigns those
 * seats to their CAs. Each assignment is one `seat_assignments` row per
 * (person, course); `clinic_members` stays the person↔clinic identity.
 *
 * Compliance ethos: `seatsPurchased` is the ONLY stored count. Consumed seats are
 * RECOMPUTED from assignments (`invited|active`), never stored. `expired`/`revoked`
 * free the seat. `active` is terminal — a member leaving the clinic never revokes
 * their enrollment or certificate; refunds are logged for manual handling.
 *
 * Assigning an already-active member grants access immediately (no invite). A new
 * or unclaimed CA gets an `invited` assignment with a one-time token; claiming it
 * authenticates them and activates the enrollment.
 */
import { and, asc, eq, inArray } from "drizzle-orm";
import type { Db } from "@/db/client";
import { schema } from "@/db/client";
import { newId, randomToken, sha256Hex } from "@/lib/crypto";
import { isoInSeconds, nowIso, isPast } from "@/lib/time";
import { activateEnrollment } from "@/lib/enrollment";
import {
  ensureCaMember,
  findCaMemberByEmail,
  linkMemberToUser,
  type Clinic,
  type ClinicMember,
} from "@/lib/clinic";

// Unclaimed invites lapse after 30 days and free the seat (Phase 4 lifecycle).
const ASSIGN_INVITE_TTL_SECONDS = 60 * 60 * 24 * 30;

export type ClinicSeatPool = typeof schema.clinicSeatPools.$inferSelect;
export type SeatAssignment = typeof schema.seatAssignments.$inferSelect;

// ---------------------------------------------------------------------------
// Pure helpers (unit-tested) — recompute consumed/available from assignments.
// ---------------------------------------------------------------------------

/** Consumed seats = assignments still holding a seat (invited|active). */
export function consumedSeats(assignments: { status: string }[]): number {
  return assignments.filter(
    (a) => a.status === "invited" || a.status === "active",
  ).length;
}

export interface PoolSummary {
  purchased: number;
  consumed: number;
  available: number;
}

/** Summarize a pool: available = max(0, purchased − consumed). Never negative. */
export function summarizePool(
  purchased: number,
  assignments: { status: string }[],
): PoolSummary {
  const consumed = consumedSeats(assignments);
  return { purchased, consumed, available: Math.max(0, purchased - consumed) };
}

// ---------------------------------------------------------------------------
// Pools
// ---------------------------------------------------------------------------

export async function getPool(
  db: Db,
  clinicId: string,
  courseId: string,
): Promise<ClinicSeatPool | null> {
  const row = await db
    .select()
    .from(schema.clinicSeatPools)
    .where(
      and(
        eq(schema.clinicSeatPools.clinicId, clinicId),
        eq(schema.clinicSeatPools.courseId, courseId),
      ),
    )
    .get();
  return row ?? null;
}

/** Add `count` seats to a clinic's pool for a course, creating the pool if new. */
export async function grantPoolSeats(
  db: Db,
  clinicId: string,
  courseId: string,
  count: number,
): Promise<void> {
  const existing = await getPool(db, clinicId, courseId);
  if (existing) {
    await db
      .update(schema.clinicSeatPools)
      .set({
        seatsPurchased: existing.seatsPurchased + count,
        updatedAt: nowIso(),
      })
      .where(eq(schema.clinicSeatPools.id, existing.id));
    return;
  }
  await db.insert(schema.clinicSeatPools).values({
    id: newId("csp"),
    clinicId,
    courseId,
    seatsPurchased: count,
  });
}

// ---------------------------------------------------------------------------
// Assignments
// ---------------------------------------------------------------------------

/**
 * Lazily lapse unclaimed invites whose 30-day window has passed → `expired`
 * (frees the seat). Called before any read or assign so consumed counts are
 * always current without a scheduled sweep.
 */
export async function expireStaleAssignments(
  db: Db,
  clinicId: string,
): Promise<void> {
  const stale = await db
    .select()
    .from(schema.seatAssignments)
    .where(
      and(
        eq(schema.seatAssignments.clinicId, clinicId),
        eq(schema.seatAssignments.status, "invited"),
      ),
    )
    .all();
  const expiredIds = stale
    .filter((a) => a.inviteExpiresAt && isPast(a.inviteExpiresAt))
    .map((a) => a.id);
  if (expiredIds.length === 0) return;
  await db
    .update(schema.seatAssignments)
    .set({ status: "expired", inviteTokenHash: null })
    .where(inArray(schema.seatAssignments.id, expiredIds));
}

async function getAssignmentsForPool(
  db: Db,
  clinicId: string,
  courseId: string,
): Promise<SeatAssignment[]> {
  return db
    .select()
    .from(schema.seatAssignments)
    .where(
      and(
        eq(schema.seatAssignments.clinicId, clinicId),
        eq(schema.seatAssignments.courseId, courseId),
      ),
    )
    .all();
}

export interface AssignmentRow {
  assignment: SeatAssignment;
  email: string;
  legalName: string | null;
  intakeCompletedAt: string | null;
}

export interface PoolView {
  courseId: string;
  courseTitle: string;
  pool: ClinicSeatPool;
  summary: PoolSummary;
  assignments: AssignmentRow[];
}

/**
 * Every seat pool for a clinic, joined with course title, per-pool summary, and a
 * detailed assignment roster (member email + claimed user's legal name / intake).
 * Expires stale invites first so counts are current. Drives the owner dashboard.
 */
export async function listPoolsDetailed(
  db: Db,
  clinicId: string,
): Promise<PoolView[]> {
  await expireStaleAssignments(db, clinicId);

  const pools = await db
    .select({
      pool: schema.clinicSeatPools,
      courseTitle: schema.courses.title,
    })
    .from(schema.clinicSeatPools)
    .innerJoin(
      schema.courses,
      eq(schema.clinicSeatPools.courseId, schema.courses.id),
    )
    .where(eq(schema.clinicSeatPools.clinicId, clinicId))
    .orderBy(asc(schema.courses.title))
    .all();

  const views: PoolView[] = [];
  for (const { pool, courseTitle } of pools) {
    const rows = await db
      .select({
        assignment: schema.seatAssignments,
        email: schema.clinicMembers.email,
        legalName: schema.users.legalName,
        intakeCompletedAt: schema.users.intakeCompletedAt,
      })
      .from(schema.seatAssignments)
      .innerJoin(
        schema.clinicMembers,
        eq(schema.seatAssignments.memberId, schema.clinicMembers.id),
      )
      .leftJoin(
        schema.users,
        eq(schema.clinicMembers.userId, schema.users.id),
      )
      .where(
        and(
          eq(schema.seatAssignments.clinicId, clinicId),
          eq(schema.seatAssignments.courseId, pool.courseId),
        ),
      )
      .orderBy(asc(schema.seatAssignments.assignedAt))
      .all();

    const assignments: AssignmentRow[] = rows.map((r) => ({
      assignment: r.assignment,
      email: r.email,
      legalName: r.legalName || null,
      intakeCompletedAt: r.intakeCompletedAt ?? null,
    }));
    views.push({
      courseId: pool.courseId,
      courseTitle,
      pool,
      summary: summarizePool(
        pool.seatsPurchased,
        assignments.map((a) => a.assignment),
      ),
      assignments,
    });
  }
  return views;
}

export type AssignResult =
  | { ok: true; mode: "active" | "invited"; token?: string; email: string }
  | { ok: false; reason: string };

/**
 * Assign a course seat to a CA by email.
 *  - Already-active member → grant access immediately (no invite): an `active`
 *    assignment + an active `clinic_seat` enrollment.
 *  - New / unclaimed CA → an `invited` assignment with a one-time token; the
 *    caller emails the claim link.
 * A live (invited|active) assignment for the same (member, course) is rejected; an
 * `expired`/`revoked` one is reactivated in place (the unique (member,course)
 * index means one slot per person per course).
 */
export async function assignSeat(
  db: Db,
  clinic: Clinic,
  courseId: string,
  rawEmail: string,
): Promise<AssignResult> {
  const email = rawEmail.trim().toLowerCase();
  if (!email || !email.includes("@")) {
    return { ok: false, reason: "Please enter a valid email address." };
  }

  const pool = await getPool(db, clinic.id, courseId);
  if (!pool) {
    return { ok: false, reason: "Buy seats for this course before assigning." };
  }

  await expireStaleAssignments(db, clinic.id);
  const summary = summarizePool(
    pool.seatsPurchased,
    await getAssignmentsForPool(db, clinic.id, courseId),
  );
  if (summary.available < 1) {
    return {
      ok: false,
      reason: "No seats available for this course. Buy more to assign another CA.",
    };
  }

  // Resolve (or create) the CA member identity. An already-active member with a
  // linked user gets a direct active assignment; otherwise an invite.
  const existingMember = await findCaMemberByEmail(db, clinic.id, email);
  const isActiveMember =
    !!existingMember &&
    existingMember.status === "active" &&
    !!existingMember.userId;
  const member: ClinicMember = isActiveMember
    ? existingMember!
    : await ensureCaMember(db, clinic.id, email);

  // Existing assignment for this (member, course)?
  const prior = await db
    .select()
    .from(schema.seatAssignments)
    .where(
      and(
        eq(schema.seatAssignments.memberId, member.id),
        eq(schema.seatAssignments.courseId, courseId),
      ),
    )
    .get();
  if (prior && (prior.status === "invited" || prior.status === "active")) {
    return {
      ok: false,
      reason:
        prior.status === "active"
          ? "That CA already has this course."
          : "That CA already has a pending invite for this course.",
    };
  }

  if (isActiveMember) {
    // Direct active grant — no invite needed.
    await activateEnrollment(db, member.userId!, courseId, {
      paymentStatus: "clinic_seat",
    });
    const enrollment = await db
      .select({ id: schema.enrollments.id })
      .from(schema.enrollments)
      .where(
        and(
          eq(schema.enrollments.userId, member.userId!),
          eq(schema.enrollments.courseId, courseId),
        ),
      )
      .get();
    await upsertAssignment(db, prior?.id ?? null, {
      clinicId: clinic.id,
      courseId,
      memberId: member.id,
      status: "active",
      enrollmentId: enrollment?.id ?? null,
      inviteTokenHash: null,
      inviteExpiresAt: null,
      claimedAt: nowIso(),
    });
    return { ok: true, mode: "active", email };
  }

  // Invite path: hold the seat with a one-time token.
  const token = randomToken();
  const inviteTokenHash = await sha256Hex(token);
  await upsertAssignment(db, prior?.id ?? null, {
    clinicId: clinic.id,
    courseId,
    memberId: member.id,
    status: "invited",
    enrollmentId: null,
    inviteTokenHash,
    inviteExpiresAt: isoInSeconds(ASSIGN_INVITE_TTL_SECONDS),
    claimedAt: null,
  });
  return { ok: true, mode: "invited", token, email };
}

interface AssignmentValues {
  clinicId: string;
  courseId: string;
  memberId: string;
  status: "invited" | "active" | "expired" | "revoked";
  enrollmentId: string | null;
  inviteTokenHash: string | null;
  inviteExpiresAt: string | null;
  claimedAt: string | null;
}

/** Insert a new assignment, or reactivate an existing (expired/revoked) slot. */
async function upsertAssignment(
  db: Db,
  priorId: string | null,
  values: AssignmentValues,
): Promise<void> {
  if (priorId) {
    await db
      .update(schema.seatAssignments)
      .set({
        status: values.status,
        enrollmentId: values.enrollmentId,
        inviteTokenHash: values.inviteTokenHash,
        inviteExpiresAt: values.inviteExpiresAt,
        assignedAt: nowIso(),
        claimedAt: values.claimedAt,
      })
      .where(eq(schema.seatAssignments.id, priorId));
    return;
  }
  await db.insert(schema.seatAssignments).values({
    id: newId("sa"),
    ...values,
  });
}

export type SeatTokenResult =
  | { ok: true; assignmentId: string; memberId: string; clinicId: string; email: string }
  | { ok: false; reason: string };

/** Validate a seat-invite token. Returns the member to authenticate + link. */
export async function acceptSeatToken(
  db: Db,
  token: string,
): Promise<SeatTokenResult> {
  if (!token) return { ok: false, reason: "This invite link is not valid." };
  const hash = await sha256Hex(token);

  const assignment = await db
    .select()
    .from(schema.seatAssignments)
    .where(eq(schema.seatAssignments.inviteTokenHash, hash))
    .get();
  if (!assignment) return { ok: false, reason: "This invite link is not valid." };
  if (assignment.status !== "invited") {
    return { ok: false, reason: "This invite has already been used." };
  }
  if (assignment.inviteExpiresAt && isPast(assignment.inviteExpiresAt)) {
    return { ok: false, reason: "This invite link has expired." };
  }

  const member = await db
    .select({ email: schema.clinicMembers.email })
    .from(schema.clinicMembers)
    .where(eq(schema.clinicMembers.id, assignment.memberId))
    .get();
  if (!member) return { ok: false, reason: "This invite link is not valid." };

  return {
    ok: true,
    assignmentId: assignment.id,
    memberId: assignment.memberId,
    clinicId: assignment.clinicId,
    email: member.email,
  };
}

/**
 * Claim a CA's seats once they're authenticated: link the member identity, then
 * activate EVERY pending invited assignment for that member (one claim onboards
 * them and grants all currently-invited course seats), each as an active
 * `clinic_seat` enrollment. Returns the course ids granted.
 */
export async function claimSeatsForMember(
  db: Db,
  memberId: string,
  userId: string,
): Promise<string[]> {
  await linkMemberToUser(db, memberId, userId);

  const pending = await db
    .select()
    .from(schema.seatAssignments)
    .where(
      and(
        eq(schema.seatAssignments.memberId, memberId),
        eq(schema.seatAssignments.status, "invited"),
      ),
    )
    .all();

  const granted: string[] = [];
  for (const a of pending) {
    await activateEnrollment(db, userId, a.courseId, {
      paymentStatus: "clinic_seat",
    });
    const enrollment = await db
      .select({ id: schema.enrollments.id })
      .from(schema.enrollments)
      .where(
        and(
          eq(schema.enrollments.userId, userId),
          eq(schema.enrollments.courseId, a.courseId),
        ),
      )
      .get();
    await db
      .update(schema.seatAssignments)
      .set({
        status: "active",
        claimedAt: nowIso(),
        inviteTokenHash: null,
        enrollmentId: enrollment?.id ?? null,
      })
      .where(eq(schema.seatAssignments.id, a.id));
    granted.push(a.courseId);
  }
  return granted;
}

/** Revoke a pending (invited) assignment — frees the seat. Active is terminal. */
export async function revokeAssignment(
  db: Db,
  clinicId: string,
  assignmentId: string,
): Promise<boolean> {
  const a = await db
    .select()
    .from(schema.seatAssignments)
    .where(eq(schema.seatAssignments.id, assignmentId))
    .get();
  if (!a || a.clinicId !== clinicId || a.status !== "invited") return false;
  await db
    .update(schema.seatAssignments)
    .set({ status: "revoked", inviteTokenHash: null })
    .where(eq(schema.seatAssignments.id, assignmentId));
  return true;
}
