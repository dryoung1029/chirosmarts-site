/**
 * Accept a clinic invite. The token in the URL proves the CA owns the invited
 * email, so claiming it both authenticates them (creates a session) and links
 * their membership — the same security model as a magic link. New CAs then
 * finish intake; returning users land on their dashboard.
 */
import type { APIRoute } from "astro";
import { getDb } from "@/db/client";
import { getSiteUrl } from "@/lib/env";
import { acceptInvite, linkInviteToUser } from "@/lib/clinic";
import { findOrCreateUserByEmail } from "@/lib/auth/users";
import { createSession } from "@/lib/auth/session";
import { logEvent } from "@/lib/events";

export const GET: APIRoute = async ({ url, locals, cookies, request, redirect }) => {
  const env = locals.runtime.env;
  const db = getDb(env);
  const token = url.searchParams.get("token") ?? "";

  const result = await acceptInvite(db, token);
  if (!result.ok) {
    return redirect(`/login?error=${encodeURIComponent(result.reason)}`, 302);
  }

  const user = await findOrCreateUserByEmail(db, result.email);
  await linkInviteToUser(db, result.memberId, user.id);

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
  await logEvent(db, {
    userId: user.id,
    type: "clinic_invite_accepted",
    payload: { clinicId: result.clinicId, memberId: result.memberId },
  });

  return redirect(user.intakeCompletedAt ? "/dashboard" : "/intake", 302);
};
