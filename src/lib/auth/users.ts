import { eq } from "drizzle-orm";
import type { Db } from "@/db/client";
import { schema } from "@/db/client";
import { newId } from "@/lib/crypto";
import { nowIso } from "@/lib/time";
import { logEvent } from "@/lib/events";

/**
 * Find a user by email, or create a shell user (empty legal_name, no intake yet).
 * Called from the magic-link callback once email ownership is proven.
 */
export async function findOrCreateUserByEmail(db: Db, email: string) {
  const normalized = email.trim().toLowerCase();
  const existing = await db
    .select()
    .from(schema.users)
    .where(eq(schema.users.email, normalized))
    .get();
  if (existing) return existing;

  const user = {
    id: newId("usr"),
    email: normalized,
  };
  await db.insert(schema.users).values(user);
  const created = await db
    .select()
    .from(schema.users)
    .where(eq(schema.users.id, user.id))
    .get();
  // record the signup in the audit trail
  await logEvent(db, { userId: user.id, type: "signup" });
  return created!;
}

export async function markIntakeComplete(db: Db, userId: string) {
  await db
    .update(schema.users)
    .set({ intakeCompletedAt: nowIso(), updatedAt: nowIso() })
    .where(eq(schema.users.id, userId));
}
