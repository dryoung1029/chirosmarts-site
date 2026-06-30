/**
 * Admin user maintenance: reset a user's learning state, or delete a user
 * entirely. Intended for TEST accounts, erroneous signups, and legitimate
 * data-erasure (GDPR/CCPA) requests.
 *
 * NOTE: this deliberately removes compliance data (events, quiz_attempts,
 * certificates, documents) that the platform otherwise never auto-deletes
 * (CLAUDE.md §6). It is gated behind an explicit, typed-confirmation admin
 * action — never call it from automated flows.
 */
import { and, eq, inArray } from "drizzle-orm";
import { getDb, schema } from "@/db/client";

const HEARTBEAT = "lesson_heartbeat";

/**
 * Reset SEAT TIME for a single lesson (troubleshooting): delete this user's
 * heartbeat events for the lesson + clear any playback lease, so they can
 * re-watch and re-accrue. Leaves quiz attempts, certificates, and enrollment
 * intact. Explicit admin action.
 */
export async function resetLessonProgress(
  env: CloudflareEnv,
  userId: string,
  lessonId: string,
): Promise<void> {
  const db = getDb(env);
  await db
    .delete(schema.events)
    .where(
      and(
        eq(schema.events.userId, userId),
        eq(schema.events.lessonId, lessonId),
        eq(schema.events.type, HEARTBEAT),
      ),
    );
  await db
    .delete(schema.playbackLeases)
    .where(and(eq(schema.playbackLeases.userId, userId), eq(schema.playbackLeases.lessonId, lessonId)));
}

/**
 * Reset SEAT TIME for every lesson in a module (troubleshooting). Same scope as
 * resetLessonProgress, applied across the module's lessons. Quiz attempts and
 * certificates are left intact.
 */
export async function resetModuleProgress(
  env: CloudflareEnv,
  userId: string,
  moduleId: string,
): Promise<void> {
  const db = getDb(env);
  const lessons = await db
    .select({ id: schema.lessons.id })
    .from(schema.lessons)
    .where(eq(schema.lessons.moduleId, moduleId))
    .all();
  const lessonIds = lessons.map((l) => l.id);
  if (lessonIds.length === 0) return;
  await db
    .delete(schema.events)
    .where(
      and(
        eq(schema.events.userId, userId),
        inArray(schema.events.lessonId, lessonIds),
        eq(schema.events.type, HEARTBEAT),
      ),
    );
  await db
    .delete(schema.playbackLeases)
    .where(and(eq(schema.playbackLeases.userId, userId), inArray(schema.playbackLeases.lessonId, lessonIds)));
}

async function deleteR2Objects(env: CloudflareEnv, keys: (string | null)[]): Promise<void> {
  const bucket = env.DOCS;
  if (!bucket) return;
  for (const key of keys) {
    if (!key) continue;
    try {
      await bucket.delete(key);
    } catch {
      /* best-effort — a missing object shouldn't block the DB cleanup */
    }
  }
}

/**
 * Wipe a user's learning state so they can start over, KEEPING the account,
 * intake, roadmap, and login sessions. Removes enrollments, seat-time events,
 * quiz attempts, certificates (+ their R2 PDFs), uploaded documents (+ R2), and
 * playback leases. Seat-time/completion recompute to zero afterwards.
 */
export async function resetUserProgress(env: CloudflareEnv, userId: string): Promise<void> {
  const db = getDb(env);

  const certs = await db
    .select({ r2Key: schema.certificates.r2Key })
    .from(schema.certificates)
    .where(eq(schema.certificates.userId, userId))
    .all();
  const docs = await db
    .select({ r2Key: schema.documents.r2Key })
    .from(schema.documents)
    .where(eq(schema.documents.userId, userId))
    .all();
  await deleteR2Objects(env, [...certs.map((c) => c.r2Key), ...docs.map((d) => d.r2Key)]);

  await db.delete(schema.events).where(eq(schema.events.userId, userId));
  await db.delete(schema.quizAttempts).where(eq(schema.quizAttempts.userId, userId));
  await db.delete(schema.certificates).where(eq(schema.certificates.userId, userId));
  await db.delete(schema.documents).where(eq(schema.documents.userId, userId));
  await db.delete(schema.playbackLeases).where(eq(schema.playbackLeases.userId, userId));
  await db.delete(schema.enrollments).where(eq(schema.enrollments.userId, userId));
}

/**
 * Delete a user and every row that references them, in FK-safe order. Returns
 * false if the user doesn't exist. Also removes clinics the user OWNS (and that
 * clinic's membership rows), their own clinic memberships, roadmap, sessions,
 * and any outstanding magic links for their email.
 */
export async function deleteUser(env: CloudflareEnv, userId: string): Promise<boolean> {
  const db = getDb(env);
  const user = await db
    .select({ email: schema.users.email })
    .from(schema.users)
    .where(eq(schema.users.id, userId))
    .get();
  if (!user) return false;

  // Progress + compliance data + their R2 objects.
  await resetUserProgress(env, userId);

  // Roadmap (user_steps → user_paths).
  const paths = await db
    .select({ id: schema.userPaths.id })
    .from(schema.userPaths)
    .where(eq(schema.userPaths.userId, userId))
    .all();
  const pathIds = paths.map((p) => p.id);
  if (pathIds.length) {
    await db.delete(schema.userSteps).where(inArray(schema.userSteps.userPathId, pathIds));
  }
  await db.delete(schema.userPaths).where(eq(schema.userPaths.userId, userId));

  // Their CA membership rows.
  await db.delete(schema.clinicMembers).where(eq(schema.clinicMembers.userId, userId));

  // Clinics they OWN → drop all members of those clinics, then the clinics.
  const owned = await db
    .select({ id: schema.clinics.id })
    .from(schema.clinics)
    .where(eq(schema.clinics.ownerUserId, userId))
    .all();
  const clinicIds = owned.map((c) => c.id);
  if (clinicIds.length) {
    await db.delete(schema.clinicMembers).where(inArray(schema.clinicMembers.clinicId, clinicIds));
    await db.delete(schema.clinics).where(inArray(schema.clinics.id, clinicIds));
  }

  await db.delete(schema.sessions).where(eq(schema.sessions.userId, userId));
  await db.delete(schema.magicLinks).where(eq(schema.magicLinks.email, user.email));
  await db.delete(schema.users).where(eq(schema.users.id, userId));
  return true;
}
