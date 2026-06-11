/**
 * Server-side sessions in D1. The cookie holds a random opaque token; D1 stores
 * only its hash (session id). Concurrent logins are allowed — we never revoke
 * sessions to enforce single-playback (that's the playback-lease's job, M2).
 */
import { eq } from "drizzle-orm";
import type { AstroCookies } from "astro";
import type { Db } from "@/db/client";
import { schema } from "@/db/client";
import { randomToken, sha256Hex } from "@/lib/crypto";
import { isoInSeconds, nowIso, isPast } from "@/lib/time";

export const SESSION_COOKIE = "cs_session";
const SESSION_TTL_SECONDS = 60 * 60 * 24 * 30; // 30 days

export type SessionUser = typeof schema.users.$inferSelect;

/** Create a session row and set the cookie. Returns the user-facing token. */
export async function createSession(
  db: Db,
  cookies: AstroCookies,
  userId: string,
  meta: { userAgent?: string | null; ip?: string | null },
  secure: boolean,
): Promise<void> {
  const token = randomToken();
  const id = await sha256Hex(token);
  const expiresAt = isoInSeconds(SESSION_TTL_SECONDS);

  await db.insert(schema.sessions).values({
    id,
    userId,
    expiresAt,
    userAgent: meta.userAgent ?? null,
    ip: meta.ip ?? null,
  });

  cookies.set(SESSION_COOKIE, token, {
    httpOnly: true,
    secure,
    sameSite: "lax",
    path: "/",
    maxAge: SESSION_TTL_SECONDS,
  });
}

/** Resolve the current user from the session cookie, or null. */
export async function getSessionUser(
  db: Db,
  cookies: AstroCookies,
): Promise<{ user: SessionUser; sessionId: string } | null> {
  const token = cookies.get(SESSION_COOKIE)?.value;
  if (!token) return null;

  const id = await sha256Hex(token);
  const row = await db
    .select()
    .from(schema.sessions)
    .where(eq(schema.sessions.id, id))
    .get();

  if (!row) return null;
  if (isPast(row.expiresAt)) {
    await db.delete(schema.sessions).where(eq(schema.sessions.id, id));
    return null;
  }

  const user = await db
    .select()
    .from(schema.users)
    .where(eq(schema.users.id, row.userId))
    .get();
  if (!user) return null;

  // Best-effort activity timestamp (not load-bearing).
  await db
    .update(schema.sessions)
    .set({ lastSeenAt: nowIso() })
    .where(eq(schema.sessions.id, id));

  return { user, sessionId: id };
}

/** Destroy the current session and clear the cookie. */
export async function destroySession(
  db: Db,
  cookies: AstroCookies,
): Promise<void> {
  const token = cookies.get(SESSION_COOKIE)?.value;
  if (token) {
    const id = await sha256Hex(token);
    await db.delete(schema.sessions).where(eq(schema.sessions.id, id));
  }
  cookies.delete(SESSION_COOKIE, { path: "/" });
}
