/**
 * Admin: manually issue (and email) a course completion certificate for a
 * student (access enforced in middleware). Uses the same issuance path as the
 * automatic exam-pass flow — snapshots legal name/course/credit/instructor,
 * stores the PDF in R2, logs a certificate_issued event, and is publicly
 * verifiable. Idempotent: returns the existing active certificate if one exists.
 */
import type { APIRoute } from "astro";
import { eq } from "drizzle-orm";
import { getDb, schema } from "@/db/client";
import { issueAndEmailCertificate } from "@/lib/certificate";
import { unpassedQuizzes } from "@/lib/quiz";

export const POST: APIRoute = async ({ params, request, locals, redirect }) => {
  const env = locals.runtime.env;
  const db = getDb(env);
  const userId = params.id!;

  const back = (msg: string) =>
    redirect(`/admin/students/${userId}?done=${encodeURIComponent(msg)}`, 303);

  const form = await request.formData();
  const courseId = String(form.get("courseId") ?? "").trim();
  if (!courseId) return back("No course specified.");

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
  const override = form.get("override") === "on";
  if (!override) {
    const unpassed = await unpassedQuizzes(db, userId, courseId);
    if (unpassed.length > 0) {
      const names = unpassed.map((q) => q.title).join(", ");
      return back(`Can't issue — these quizzes aren't passed yet: ${names}. Tick "issue anyway" to override.`);
    }
  }

  const result = await issueAndEmailCertificate(env, db, {
    userId,
    courseId,
    email: user.email,
    bypassQuizRequirement: override,
  });

  if (!result) return back("Couldn't issue the certificate (missing course or legal name).");
  if (!result.created) return back(`An active certificate already exists (${result.certificate.certNumber}).`);
  return back(`Certificate issued${result.certificate.certNumber ? ` (${result.certificate.certNumber})` : ""} and emailed.`);
};
