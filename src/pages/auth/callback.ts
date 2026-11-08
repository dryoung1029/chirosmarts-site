import type { APIRoute } from "astro";
import { getDb, schema } from "@/db/client";
import { eq } from "drizzle-orm";
import { getSiteUrl } from "@/lib/env";
import { consumeMagicLink } from "@/lib/auth/magic-link";
import { findOrCreateUserByEmail } from "@/lib/auth/users";
import { createSession } from "@/lib/auth/session";
import { logEvent } from "@/lib/events";
import { adminEmails, isAdminEmail } from "@/lib/admin";

export const GET: APIRoute = async ({ url, locals, cookies, request, redirect }) => {
  const env = locals.runtime.env;
  const db = getDb(env);
  const token = url.searchParams.get("token") ?? "";

  const result = await consumeMagicLink(db, token);
  if (!result.ok) {
    return redirect(`/login?error=${encodeURIComponent(result.reason)}`, 302);
  }

  const user = await findOrCreateUserByEmail(db, result.email);

  // Sync the stored role to the ADMIN_EMAILS allowlist, BOTH ways. Promotion
  // was always here; demotion wasn't, so an address removed from the list kept
  // admin forever through the persisted role. (isAdmin also checks the list
  // directly; this keeps the stored role honest for role-only checks.)
  if (isAdminEmail(env, user.email) && user.role !== "site_admin") {
    await db
      .update(schema.users)
      .set({ role: "site_admin" })
      .where(eq(schema.users.id, user.id));
    user.role = "site_admin";
  } else if (
    user.role === "site_admin" &&
    !isAdminEmail(env, user.email) &&
    adminEmails(env).size > 0 // never demote on a missing/empty env var
  ) {
    await db
      .update(schema.users)
      .set({ role: "student" })
      .where(eq(schema.users.id, user.id));
    user.role = "student";
    await logEvent(db, {
      userId: user.id,
      type: "admin_role_revoked",
      payload: { email: user.email, reason: "not in ADMIN_EMAILS at login" },
    });
  }

  // Cookies are only marked Secure when the public URL is https (so local
  // http://localhost dev still works).
  const secure = getSiteUrl(env).startsWith("https://");
  await createSession(
    db,
    cookies,
    user.id,
    {
      userAgent: request.headers.get("user-agent"),
      ip: request.headers.get("cf-connecting-ip"),
    },
    secure,
  );
  await logEvent(db, { userId: user.id, type: "login" });

  // New users finish intake; returning users go to their dashboard.
  return redirect(user.intakeCompletedAt ? "/dashboard" : "/intake", 302);
};
