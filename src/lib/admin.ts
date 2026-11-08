/**
 * Admin access (M5). Admins are designated by the ADMIN_EMAILS env var
 * (comma/space separated) and by NOTHING else. On login we sync the stored
 * `site_admin` role to the allowlist in both directions (see auth/callback),
 * but the role is only a cache: `isAdmin` checks the allowlist itself, so
 * removing an address from ADMIN_EMAILS revokes access on the very next
 * request, even for a session that is already signed in.
 *
 * The one exception is an EMPTY allowlist (variable unset / misconfigured
 * deploy): then the stored role is honoured, so a missing env var can't lock
 * the owner out of their own admin.
 */
import type { SessionUser } from "@/lib/auth/session";

export function adminEmails(env: CloudflareEnv): Set<string> {
  return new Set(
    (env.ADMIN_EMAILS ?? "")
      .split(/[,\s]+/)
      .map((e) => e.trim().toLowerCase())
      .filter(Boolean),
  );
}

export function isAdminEmail(env: CloudflareEnv, email: string): boolean {
  return adminEmails(env).has(email.trim().toLowerCase());
}

export function isAdmin(
  env: CloudflareEnv,
  user: SessionUser | null,
): user is SessionUser {
  if (!user) return false;
  const allow = adminEmails(env);
  if (allow.size === 0) {
    console.warn("[admin] ADMIN_EMAILS is empty — falling back to the stored site_admin role");
    return user.role === "site_admin";
  }
  return allow.has(user.email.trim().toLowerCase());
}
