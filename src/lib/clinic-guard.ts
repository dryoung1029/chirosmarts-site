/**
 * Shared guard for clinic-owner management endpoints: requires a signed-in
 * clinic_admin who actually owns a clinic. Returns the clinic or null.
 */
import type { Db } from "@/db/client";
import type { SessionUser } from "@/lib/auth/session";
import { getClinicForOwner, type Clinic } from "@/lib/clinic";

export async function requireOwnedClinic(
  db: Db,
  user: SessionUser | null,
): Promise<Clinic | null> {
  if (!user || user.role !== "clinic_admin") return null;
  return getClinicForOwner(db, user.id);
}
