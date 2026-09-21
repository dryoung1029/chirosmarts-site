/**
 * Account facts for a support request, so an AI reply can be specific ("your
 * HIPAA course shows 3 of 9 lessons complete") instead of generic. Read-only,
 * and deliberately narrow: progress and entitlements only — never payment
 * details, never other students, never anything from the compliance audit trail
 * beyond what the student can already see on their own dashboard.
 */
import { eq } from "drizzle-orm";
import type { Db } from "@/db/client";
import { schema } from "@/db/client";
import { getUserRoadmap } from "@/lib/roadmap";
import { formatPacific } from "@/lib/time";

export async function buildStudentContext(
  db: Db,
  email: string,
): Promise<{ userId: string | null; context: string }> {
  const user = await db
    .select()
    .from(schema.users)
    .where(eq(schema.users.email, email.trim().toLowerCase()))
    .get();
  if (!user) {
    return {
      userId: null,
      context:
        "No ChiroSmarts account exists for this email address. They may have signed up with a different address, or may not have an account yet.",
    };
  }

  const lines: string[] = [];
  lines.push(`Name: ${user.legalName || user.displayName || "(not set)"}`);
  lines.push(`Role: ${user.role}`);
  if (user.birthMonth) lines.push(`Renewal birth month: ${user.birthMonth}`);

  const enrollments = await db
    .select({
      title: schema.courses.title,
      slug: schema.courses.slug,
      status: schema.enrollments.status,
    })
    .from(schema.enrollments)
    .innerJoin(schema.courses, eq(schema.enrollments.courseId, schema.courses.id))
    .where(eq(schema.enrollments.userId, user.id))
    .all();
  lines.push(
    enrollments.length
      ? `Enrolled courses: ${enrollments.map((e) => `${e.title} (${e.status})`).join("; ")}`
      : "Enrolled courses: none",
  );

  const certs = await db
    .select({
      code: schema.certificates.verificationCode,
      title: schema.certificates.courseTitleSnapshot,
      status: schema.certificates.status,
      issuedAt: schema.certificates.issuedAt,
    })
    .from(schema.certificates)
    .where(eq(schema.certificates.userId, user.id))
    .all();
  lines.push(
    certs.length
      ? `Certificates: ${certs
          .map(
            (c) =>
              `${c.title} — ${c.status}${c.issuedAt ? ` on ${formatPacific(c.issuedAt, { dateStyle: "medium" })}` : ""}`,
          )
          .join("; ")}`
      : "Certificates: none yet",
  );

  // Where they actually are on the roadmap — the single most common question.
  try {
    const roadmap = await getUserRoadmap(db, user.id);
    for (const { template, steps } of roadmap) {
      const summary = steps
        .map((s) => `${s.position}. ${s.title} [${s.status}]`)
        .join(" | ");
      lines.push(`Roadmap "${template?.name ?? "path"}": ${summary}`);
    }
  } catch {
    // Roadmap is nice-to-have context; never fail triage over it.
  }

  return { userId: user.id, context: lines.join("\n") };
}
