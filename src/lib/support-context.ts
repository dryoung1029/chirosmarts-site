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
import { getCourseSeatTime } from "@/lib/progress";
import { unpassedQuizzes } from "@/lib/quiz";
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
      courseId: schema.courses.id,
      title: schema.courses.title,
      slug: schema.courses.slug,
      status: schema.enrollments.status,
    })
    .from(schema.enrollments)
    .innerJoin(schema.courses, eq(schema.enrollments.courseId, schema.courses.id))
    .where(eq(schema.enrollments.userId, user.id))
    .all();

  if (!enrollments.length) {
    lines.push("Enrolled courses: none");
  } else {
    // Per-course PROGRESS is the thing support answers hinge on: students often
    // believe they've "finished" when lessons are watched but knowledge checks
    // or the final exam are outstanding. Spell out exactly what's left so the
    // reply corrects the misunderstanding instead of repeating it back.
    lines.push("COURSE PROGRESS (authoritative — trust this over what they say):");
    for (const e of enrollments) {
      const parts: string[] = [`- ${e.title} [${e.status}]`];
      try {
        const st = await getCourseSeatTime(db, user.id, e.courseId);
        const done = st.perLesson.filter((p) => p.meetsThreshold).length;
        parts.push(
          `  Lessons watched to the 90% threshold: ${done} of ${st.perLesson.length}.`,
        );
        parts.push(
          `  Content watched: ${Math.round(st.watchedFraction * 100)}% of the course video.`,
        );
        const unmet = st.perLesson
          .filter((p) => !p.meetsThreshold)
          .map((p) => `"${p.title}" (${Math.round(p.fraction * 100)}%)`);
        if (unmet.length)
          parts.push(`  Lessons still short of 90%: ${unmet.join(", ")}.`);
        parts.push(
          `  Final exam unlocked: ${st.examUnlocked ? "YES" : "NO — seat-time requirement not met yet"}.`,
        );

        const unpassed = await unpassedQuizzes(db, user.id, e.courseId);
        parts.push(
          unpassed.length
            ? `  NOT YET PASSED: ${unpassed.map((q) => `"${q.title}"`).join(", ")}. A certificate CANNOT be issued until every one of these is passed.`
            : `  All quizzes and the final exam are passed.`,
        );
      } catch {
        parts.push("  (progress unavailable)");
      }
      lines.push(parts.join("\n"));
    }
  }

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
