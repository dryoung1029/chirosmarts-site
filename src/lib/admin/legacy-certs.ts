/**
 * Issue a certificate for a LEGACY completion — someone who finished training in
 * the old (WordPress/WP Courseware) system, whose completion was imported into
 * `imported_contacts` (certified + completed_at) but who has no new-system
 * certificate yet.
 *
 * Bridges an imported contact to the normal issuance engine (src/lib/certificate.ts):
 *  1. find-or-create a user account for their email (so the cert has an owner and
 *     they can sign in to retrieve it later),
 *  2. set that account's legal name from the admin-confirmed value IF it has none
 *     (never overwrite a real account's name — that account is authoritative),
 *  3. issue via issueCertificate with bypassQuizRequirement (the work was done
 *     off-platform) and issuedAt = the real completion date, so name/course/
 *     credit/date/instructor are all snapshotted exactly like a normal cert.
 *
 * Idempotent: if an active certificate already exists for that user+course, it's
 * returned rather than duplicated. Emailing is opt-in per issuance.
 */
import { eq } from "drizzle-orm";
import type { Db } from "@/db/client";
import { schema } from "@/db/client";
import { findOrCreateUserByEmail } from "@/lib/auth/users";
import {
  issueCertificate,
  issueAndEmailCertificate,
  getActiveCertificate,
} from "@/lib/certificate";

export interface LegacyIssueInput {
  email: string;
  legalName: string;
  courseId: string;
  completedAt: string; // "YYYY-MM-DD" from the date input, or a full ISO string
  sendEmail: boolean;
}

export interface LegacyIssueResult {
  ok: boolean;
  message: string;
  created?: boolean;
  alreadyExisted?: boolean;
  verificationCode?: string;
  certNumber?: string | null;
}

/** Normalize a date input to an ISO timestamp at NOON UTC, so the certificate's
 *  displayed date (America/Los_Angeles) never slips to the previous day. */
function normalizeCompletionDate(input: string): string | null {
  const s = input.trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return `${s}T12:00:00.000Z`;
  const d = new Date(s);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}

export async function issueLegacyCertificate(
  env: CloudflareEnv,
  db: Db,
  input: LegacyIssueInput,
): Promise<LegacyIssueResult> {
  const email = input.email.trim().toLowerCase();
  const legalName = input.legalName.trim();
  if (!email) return { ok: false, message: "Email is required." };
  if (!legalName) return { ok: false, message: "A legal name is required for the certificate." };
  if (!input.courseId) return { ok: false, message: "Choose a course." };
  const issuedAt = normalizeCompletionDate(input.completedAt);
  if (!issuedAt) return { ok: false, message: "Enter a valid completion date." };

  const user = await findOrCreateUserByEmail(db, email);

  // Give a brand-new shell account the confirmed legal name so the certificate
  // snapshots it. Never overwrite a name a real account already has.
  if (!user.legalName || !user.legalName.trim()) {
    await db.update(schema.users).set({ legalName }).where(eq(schema.users.id, user.id));
  }

  // Idempotency: don't mint a second active cert for the same course.
  const existing = await getActiveCertificate(db, user.id, input.courseId);
  if (existing) {
    return {
      ok: true,
      alreadyExisted: true,
      verificationCode: existing.verificationCode,
      certNumber: existing.certNumber,
      message: `Already certified for this course — verification code ${existing.verificationCode}.`,
    };
  }

  const args = {
    userId: user.id,
    courseId: input.courseId,
    issuedAt,
    bypassQuizRequirement: true,
    email,
  };
  const result = input.sendEmail
    ? await issueAndEmailCertificate(env, db, args)
    : await issueCertificate(env, db, args);

  if (!result) {
    return {
      ok: false,
      message:
        "Couldn't issue the certificate — confirm the course exists and the account has a legal name.",
    };
  }

  return {
    ok: true,
    created: result.created,
    verificationCode: result.certificate.verificationCode,
    certNumber: result.certificate.certNumber,
    message: `Certificate issued (${result.certificate.certNumber}) — verification code ${result.certificate.verificationCode}${input.sendEmail ? ", emailed to the student" : ""}.`,
  };
}
