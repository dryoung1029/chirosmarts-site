/**
 * Admin access (M5). Admins are designated by the ADMIN_EMAILS env var
 * (comma/space separated). On login we persist the `site_admin` role for any
 * matching account (see auth/callback), but `isAdmin` also checks the allowlist
 * directly so access works even before that runs.
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
  return user.role === "site_admin" || isAdminEmail(env, user.email);
}
