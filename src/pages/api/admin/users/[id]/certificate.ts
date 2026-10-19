/**
 * Admin: manually issue (and email) a course completion certificate for a
 * student (access enforced in middleware). Uses the same issuance path as the
 * automatic exam-pass flow — snapshots legal name/course/credit/instructor,
 * stores the PDF in R2, logs a certificate_issued event, and is publicly
 * verifiable. Idempotent: returns the existing active certificate if one exists.
 *
 * Every manual issuance additionally writes a `cert_issued_manually` audit
 * event naming the ADMIN who did it, the student, the course, a required
 * free-text reason, and which quizzes were outstanding at the time. Quiz and
 * exam attempts are append-only and are NEVER deleted or altered to make an
 * issuance possible — the gate is bypassed on the record, not erased.
 */
import type { APIRoute } from "astro";
import { eq } from "drizzle-orm";
import { getDb, schema } from "@/db/client";
import { issueAndEmailCertificate } from "@/lib/certificate";
import { unpassedQuizzes } from "@/lib/quiz";
import { logEvent } from "@/lib/events";

export const POST: APIRoute = async ({ params, request, locals, redirect }) => {
  const env = locals.runtime.env;
  const db = getDb(env);
  const userId = params.id!;

  const back = (msg: string) =>
    redirect(`/admin/students/${userId}?done=${encodeURIComponent(msg)}`, 303);

  const form = await request.formData();
  const courseId = String(form.get("courseId") ?? "").trim();
  if (!courseId) return back("No course specified.");

  // A manual issuance is an auditable act: it must say why, in someone's words.
  const reason = String(form.get("reason") ?? "").trim().slice(0, 500);
  if (!reason) {
    return back("Add a reason — manual certificate issuance is recorded in the audit trail.");
  }

  const user = await db
    .select({ email: schema.users.email, legalName: schema.users.legalName })
    .from(schema.users)
    .where(eq(schema.users.id, userId))
    .get();
  if (!user) return redirect("/admin/students", 303);
  if (!user.legalName?.trim()) {
    return back("Can't issue — the student has no legal name yet (they must complete intake).");
  }

  // Quizzes must be passed first, unless the admin explicitly overrides.
  // Capture what was outstanding either way, so the audit event records the
  // exact state at the moment of issuance.
  const override = form.get("override") === "on";
  const unpassed = await unpassedQuizzes(db, userId, courseId);
  if (!override && unpassed.length > 0) {
    const names = unpassed.map((q) => q.title).join(", ");
    return back(`Can't issue — these quizzes aren't passed yet: ${names}. Tick "issue anyway" to override.`);
  }

  const result = await issueAndEmailCertificate(env, db, {
    userId,
    courseId,
    email: user.email,
    bypassQuizRequirement: override,
  });

  if (!result) return back("Couldn't issue the certificate (missing course or legal name).");
  if (!result.created) return back(`An active certificate already exists (${result.certificate.certNumber}).`);

  // Audit trail (append-only): who issued it, to whom, for what, and why.
  await logEvent(db, {
    userId, // the STUDENT the certificate belongs to
    type: "cert_issued_manually",
    courseId,
    payload: {
      adminUserId: locals.realUser?.id ?? locals.user?.id ?? null,
      adminEmail: locals.realUser?.email ?? locals.user?.email ?? null,
      studentUserId: userId,
      courseId,
      reason,
      certificateId: result.certificate.id,
      certNumber: result.certificate.certNumber,
      verificationCode: result.certificate.verificationCode,
      gateBypassed: override,
      // What was still unpassed when the certificate was issued. Retained for
      // the record; these attempts were not modified.
      unpassedAtIssuance: unpassed.map((q) => q.title),
    },
  });
  return back(`Certificate issued${result.certificate.certNumber ? ` (${result.certificate.certNumber})` : ""} and emailed.`);
};
