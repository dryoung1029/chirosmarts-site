/**
 * Admin "view as" impersonation (testing/support aid).
 *
 * An admin can preview the app as any user. We store the target user id in an
 * admin-gated cookie rather than the session row (no migration, and it can't
 * survive logout). Security: middleware only honours the cookie when the REAL
 * session user is an admin, so a forged cookie on a non-admin account is ignored.
 * Impersonation is READ-ONLY — middleware blocks state-changing requests while
 * it's active, so no action is ever taken under another person's identity.
 */
import type { AstroCookies } from "astro";
import { eq } from "drizzle-orm";
import type { Db } from "@/db/client";
import { schema } from "@/db/client";
import type { SessionUser } from "@/lib/auth/session";

export const IMPERSONATE_COOKIE = "cs_impersonate";

export function setImpersonation(cookies: AstroCookies, targetUserId: string) {
  cookies.set(IMPERSONATE_COOKIE, targetUserId, {
    httpOnly: true,
    secure: true,
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60 * 4, // a short testing window; clears on its own
  });
}

export function clearImpersonation(cookies: AstroCookies) {
  cookies.delete(IMPERSONATE_COOKIE, { path: "/" });
}

export function getImpersonationTargetId(cookies: AstroCookies): string | null {
  return cookies.get(IMPERSONATE_COOKIE)?.value ?? null;
}

export async function getUserById(
  db: Db,
  id: string,
): Promise<SessionUser | null> {
  const row = await db
    .select()
    .from(schema.users)
    .where(eq(schema.users.id, id))
    .get();
  return row ?? null;
}
