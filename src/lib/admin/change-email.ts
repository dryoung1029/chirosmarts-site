/**
 * Change a student's SIGN-IN EMAIL. The email is the login identity (magic
 * links, no passwords), so this is an auth change, not a profile edit — it
 * moves every email-keyed row that identifies the account, invalidates links
 * addressed to the old inbox, and writes an append-only `email_changed` audit
 * event naming the admin who did it and why.
 *
 * Nothing here deletes compliance data. `events`, `quiz_attempts`,
 * `certificates`, and `documents` are keyed by user id and are untouched;
 * certificates snapshot the legal name, not the email, so issued certificates
 * stay valid and verifiable exactly as printed.
 */
import { eq, inArray } from "drizzle-orm";
import { getDb, schema } from "@/db/client";
import { isValidEmail, normalizeEmail } from "@/lib/leads";
import { isAdminEmail } from "@/lib/admin";
import { nowIso } from "@/lib/time";
import { sendEmail } from "@/lib/email/resend";
import { emailFooterHtml, emailFooterText } from "@/lib/email/footer";
import { getSiteUrl } from "@/lib/env";
import { logEvent } from "@/lib/events";

export interface ChangeEmailInput {
  userId: string;
  newEmail: string;
  reason: string;
  /** Sign the student out of every device. Default true — see the endpoint. */
  revokeSessions?: boolean;
  adminUserId?: string | null;
  adminEmail?: string | null;
}

export interface ChangeEmailResult {
  ok: boolean;
  message: string;
}

/** Notify BOTH inboxes. The notice to the OLD address is the student's only
 *  chance to catch a change they didn't ask for, so it is not optional. */
async function notify(
  env: CloudflareEnv,
  oldEmail: string,
  newEmail: string,
): Promise<void> {
  const site = getSiteUrl(env).replace(/\/$/, "");
  const reason =
    "You're receiving this because the sign-in email on a ChiroSmarts account was changed.";
  const body =
    `The sign-in email for your ChiroSmarts account was changed from ${oldEmail} to ${newEmail}.\n\n` +
    `From now on, sign in at ${site}/login using ${newEmail}. Your courses, watched time, ` +
    `quiz attempts, and certificates are unchanged.\n\n` +
    `If you didn't expect this, reply to this email right away.`;
  const html =
    `<p>The sign-in email for your ChiroSmarts account was changed from <strong>${oldEmail}</strong> ` +
    `to <strong>${newEmail}</strong>.</p>` +
    `<p>From now on, sign in at <a href="${site}/login">${site}/login</a> using <strong>${newEmail}</strong>. ` +
    `Your courses, watched time, quiz attempts, and certificates are unchanged.</p>` +
    `<p>If you didn't expect this, reply to this email right away.</p>`;
  const subject = "Your ChiroSmarts sign-in email was changed";

  for (const to of [oldEmail, newEmail]) {
    try {
      await sendEmail(env, {
        to,
        subject,
        text: body + emailFooterText(site, reason),
        html: html + emailFooterHtml(site, reason),
      });
    } catch (e) {
      // Best effort: a mail failure must not leave the account half-changed.
      console.error("[admin] email-change notice failed", to, e);
    }
  }
}

export async function changeUserEmail(
  env: CloudflareEnv,
  input: ChangeEmailInput,
): Promise<ChangeEmailResult> {
  const db = getDb(env);
  const newEmail = normalizeEmail(input.newEmail);
  const reason = input.reason.trim().slice(0, 500);

  if (!newEmail) return { ok: false, message: "Enter the new email address." };
  if (!isValidEmail(newEmail)) {
    return { ok: false, message: `"${newEmail}" doesn't look like an email address.` };
  }
  if (!reason) {
    return {
      ok: false,
      message: "Add a reason — an email change is recorded in the audit trail.",
    };
  }

  const user = await db
    .select({
      id: schema.users.id,
      email: schema.users.email,
      role: schema.users.role,
    })
    .from(schema.users)
    .where(eq(schema.users.id, input.userId))
    .get();
  if (!user) return { ok: false, message: "User not found." };

  const oldEmail = user.email;
  if (normalizeEmail(oldEmail) === newEmail) {
    return { ok: false, message: "That's already their email address." };
  }

  // Admin access is granted by the ADMIN_EMAILS env var, so moving an admin's
  // address here would silently strip their access on next login. Make the
  // ordering explicit rather than half-doing it.
  if (user.role === "site_admin" || isAdminEmail(env, oldEmail)) {
    return {
      ok: false,
      message:
        "This is an admin account — update the ADMIN_EMAILS environment variable first, " +
        "then change the address (otherwise they lose admin access at next login).",
    };
  }

  // users.email is UNIQUE; catch the collision with a readable message instead
  // of a constraint error.
  const taken = await db
    .select({ id: schema.users.id })
    .from(schema.users)
    .where(eq(schema.users.email, newEmail))
    .get();
  if (taken) {
    return {
      ok: false,
      message: `${newEmail} already belongs to another account — merge or delete that one first.`,
    };
  }

  await db
    .update(schema.users)
    .set({ email: newEmail, updatedAt: nowIso() })
    .where(eq(schema.users.id, user.id));

  // Clinic membership rows carry the invited address; move the claimed ones so
  // a clinic owner's roster shows where their CA actually gets mail.
  await db
    .update(schema.clinicMembers)
    .set({ email: newEmail })
    .where(eq(schema.clinicMembers.userId, user.id));

  // Outstanding magic links are addressed to an inbox, not a user id:
  //  - a pending link for the OLD address would hit findOrCreateUserByEmail and
  //    mint a DUPLICATE shell account at that address;
  //  - a pending link for the NEW address (someone's typo at the login form)
  //    would now sign that person into THIS account.
  // Neither is acceptable, so both are discarded.
  await db
    .delete(schema.magicLinks)
    .where(inArray(schema.magicLinks.email, [oldEmail, newEmail]));

  const revoked = input.revokeSessions !== false;
  if (revoked) {
    await db.delete(schema.sessions).where(eq(schema.sessions.userId, user.id));
  }

  await logEvent(db, {
    userId: user.id,
    type: "email_changed",
    payload: {
      adminUserId: input.adminUserId ?? null,
      adminEmail: input.adminEmail ?? null,
      studentUserId: user.id,
      oldEmail,
      newEmail,
      reason,
      sessionsRevoked: revoked,
    },
  });

  await notify(env, oldEmail, newEmail);

  return {
    ok: true,
    message:
      `Sign-in email changed to ${newEmail}` +
      (revoked ? " and the student was signed out everywhere" : "") +
      ". Both addresses were notified.",
  };
}
