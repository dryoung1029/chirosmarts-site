import type { APIRoute } from "astro";
import { getDb } from "@/db/client";
import { getSiteUrl } from "@/lib/env";
import { consumeMagicLink } from "@/lib/auth/magic-link";
import { findOrCreateUserByEmail } from "@/lib/auth/users";
import { createSession } from "@/lib/auth/session";
import { logEvent } from "@/lib/events";

export const GET: APIRoute = async ({ url, locals, cookies, request, redirect }) => {
  const env = locals.runtime.env;
  const db = getDb(env);
  const token = url.searchParams.get("token") ?? "";

  const result = await consumeMagicLink(db, token);
  if (!result.ok) {
    return redirect(`/login?error=${encodeURIComponent(result.reason)}`, 302);
  }

  const user = await findOrCreateUserByEmail(db, result.email);

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
