/**
 * Accept a clinic seat-invite (Phase 4). The token in the URL proves the CA owns
 * the invited email, so claiming it both authenticates them (creates a session)
 * and grants every course seat currently invited for them — the same security
 * model as a magic link. New CAs then finish intake; returning users land on
 * their dashboard.
 */
import type { APIRoute } from "astro";
import { getDb } from "@/db/client";
import { getSiteUrl } from "@/lib/env";
import { acceptSeatToken, claimSeatsForMember } from "@/lib/seat-pools";
import { findOrCreateUserByEmail } from "@/lib/auth/users";
import { createSession } from "@/lib/auth/session";
import { logEvent } from "@/lib/events";

export const GET: APIRoute = async ({ url, locals, cookies, request, redirect }) => {
  const env = locals.runtime.env;
  const db = getDb(env);
  const token = url.searchParams.get("token") ?? "";

  const result = await acceptSeatToken(db, token);
  if (!result.ok) {
    return redirect(`/login?error=${encodeURIComponent(result.reason)}`, 302);
  }

  const user = await findOrCreateUserByEmail(db, result.email);
  const grantedCourseIds = await claimSeatsForMember(db, result.memberId, user.id);

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
    type: "clinic_seat_claimed",
    payload: {
      clinicId: result.clinicId,
      memberId: result.memberId,
      courseIds: grantedCourseIds,
    },
  });

  return redirect(user.intakeCompletedAt ? "/dashboard" : "/intake", 302);
};
