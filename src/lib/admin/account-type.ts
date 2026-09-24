/**
 * Admin: switch an account between student and clinic owner.
 *
 * A clinic account is more than `users.role`. Intake also gives the owner a
 * clinic (with themselves as its first member) and the clinic-owner roadmap —
 * that clinic row is what the clinic dashboard, seat purchases, and CA invites
 * all read. Flipping the role alone would drop someone on a clinic dashboard
 * with no clinic behind it, so this mirrors what intake does. Both helpers it
 * leans on are idempotent, so re-running is safe.
 *
 * Switching back to student only changes the role: the clinic, its seat pools,
 * and its members stay intact (that record is never auto-deleted), and earned
 * enrollments/certificates are untouched in either direction.
 *
 * site_admin is deliberately out of scope — it stays governed by the
 * ADMIN_EMAILS allowlist, so this screen can never hand out admin rights.
 */
import { eq } from "drizzle-orm";
import { getDb, schema } from "@/db/client";
import { createClinicForOwner } from "@/lib/clinic";
import { instantiatePath } from "@/lib/roadmap";
import { logEvent } from "@/lib/events";
import { nowIso } from "@/lib/time";

export type SwitchableRole = "student" | "clinic_admin";

export interface SwitchResult {
  ok: boolean;
  message: string;
}

export async function switchAccountType(
  env: CloudflareEnv,
  userId: string,
  target: SwitchableRole,
  clinicNameInput?: string,
): Promise<SwitchResult> {
  const db = getDb(env);
  const user = await db
    .select()
    .from(schema.users)
    .where(eq(schema.users.id, userId))
    .get();
  if (!user) return { ok: false, message: "That account no longer exists." };

  if (user.role === "site_admin") {
    return {
      ok: false,
      message:
        "Site admin accounts can't be switched here — that role comes from the ADMIN_EMAILS allowlist.",
    };
  }
  if (user.role === target) {
    return {
      ok: false,
      message: `That account is already ${target === "clinic_admin" ? "a clinic owner" : "a student"}.`,
    };
  }

  const from = user.role;

  if (target === "clinic_admin") {
    // Fall back to the clinic name captured at intake when the admin didn't type one.
    const clinicName = (clinicNameInput ?? "").trim() || (user.clinicName ?? "").trim();
    if (!clinicName) {
      return {
        ok: false,
        message: "Enter a clinic name — a clinic account needs one to create the clinic.",
      };
    }

    await db
      .update(schema.users)
      .set({ role: "clinic_admin", clinicName, updatedAt: nowIso() })
      .where(eq(schema.users.id, userId));
    // Returns null when the clinic-owner template is missing or unpublished —
    // the switch still stands, but say so rather than leaving them without a
    // roadmap and no indication why.
    const pathId = await instantiatePath(db, userId, "clinic_owner");
    const clinic = await createClinicForOwner(db, userId, user.email, clinicName);

    await logEvent(db, {
      userId,
      type: "account_type_changed",
      payload: { from, to: target, clinicId: clinic.id, clinicName, roadmapCreated: !!pathId },
    });
    return {
      ok: true,
      message:
        `Switched to a clinic account — "${clinic.name}" is set up with them as owner. They can now buy seats and invite CAs.` +
        (pathId
          ? ""
          : " Note: the clinic roadmap wasn't created — the 'oregon-clinic-owner' path template is missing or unpublished."),
    };
  }

  await db
    .update(schema.users)
    .set({ role: "student", updatedAt: nowIso() })
    .where(eq(schema.users.id, userId));
  await logEvent(db, {
    userId,
    type: "account_type_changed",
    payload: { from, to: target },
  });
  return {
    ok: true,
    message:
      "Switched to a student account. Any clinic they owned was left intact — its seats and members are unchanged.",
  };
}
