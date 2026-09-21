/**
 * Roadmap = path templates instantiated per user. Templates are DATA, not code:
 * adding a renewal path or another state is a row change, not a feature.
 *
 * On enrollment we snapshot each template step into a `user_steps` row (position
 * + title copied so later template edits don't rewrite a user's history) and set
 * a simple linear gate: the first step is complete (they just made an account),
 * the next is available, the rest are locked.
 */
import { and, asc, eq } from "drizzle-orm";
import type { Db } from "@/db/client";
import { schema } from "@/db/client";
import { newId } from "@/lib/crypto";
import { nowIso } from "@/lib/time";
import { OBCE } from "@/config/obce";

/** Map an intake path choice to a published template slug (or null). */
export const PATH_CHOICE_TO_SLUG: Record<string, string | null> = {
  initial: "oregon-ca-initial",
  renewal: "oregon-ca-renewal",
  clinic_owner: "oregon-clinic-owner", // clinic-management roadmap (seats + invites)
};

export type PathChoice = keyof typeof PATH_CHOICE_TO_SLUG;

/**
 * Instantiate a template for a user if they don't already have it. Idempotent
 * per (user, template). Returns the user_path id, or null if no template maps.
 */
export async function instantiatePath(
  db: Db,
  userId: string,
  choice: PathChoice,
): Promise<string | null> {
  const slug = PATH_CHOICE_TO_SLUG[choice];
  if (!slug) return null;

  const template = await db
    .select()
    .from(schema.pathTemplates)
    .where(eq(schema.pathTemplates.slug, slug))
    .get();
  if (!template) return null;

  // Already instantiated? Don't duplicate.
  const existing = await db
    .select({ id: schema.userPaths.id })
    .from(schema.userPaths)
    .where(
      and(
        eq(schema.userPaths.userId, userId),
        eq(schema.userPaths.templateId, template.id),
      ),
    )
    .get();
  if (existing) return existing.id;

  const steps = await db
    .select()
    .from(schema.pathTemplateSteps)
    .where(eq(schema.pathTemplateSteps.templateId, template.id))
    .orderBy(asc(schema.pathTemplateSteps.position))
    .all();

  const userPathId = newId("up");
  await db.insert(schema.userPaths).values({
    id: userPathId,
    userId,
    templateId: template.id,
  });

  let index = 0;
  for (const step of steps) {
    // Linear gate: step 1 done, step 2 available, rest locked.
    const status =
      index === 0 ? "complete" : index === 1 ? "available" : "locked";
    await db.insert(schema.userSteps).values({
      id: newId("ust"),
      userPathId,
      templateStepId: step.id,
      position: step.position,
      title: step.title,
      status,
      completedAt: index === 0 ? nowIso() : null,
    });
    index++;
  }

  return userPathId;
}

/**
 * Load a user's paths with their steps, for the dashboard.
 *
 * Step status is **derived at read time**, never a stored counter (same rule as
 * seat time): a course step is complete when the user holds a live certificate
 * for that course, and the linear gate re-opens from there. The stored
 * `user_steps.status` is honoured only when it records something the platform
 * cannot observe — a manual `complete` or `waived` set by an admin — so offline
 * steps (hands-on log, OBCE application, fingerprinting, state exam, BLS) still
 * work once a completion path exists for them.
 */
export async function getUserRoadmap(db: Db, userId: string) {
  const paths = await db
    .select()
    .from(schema.userPaths)
    .where(eq(schema.userPaths.userId, userId))
    .all();

  // Live certificates = the compliance-grade signal that a course is finished.
  const certified = new Set(
    (
      await db
        .select({
          courseId: schema.certificates.courseId,
          status: schema.certificates.status,
        })
        .from(schema.certificates)
        .where(eq(schema.certificates.userId, userId))
        .all()
    )
      .filter((c) => c.status === "issued")
      .map((c) => c.courseId),
  );

  // Enrollments tell us "started but not finished" for a nicer in-progress state.
  const enrolled = new Set(
    (
      await db
        .select({
          courseId: schema.enrollments.courseId,
          status: schema.enrollments.status,
        })
        .from(schema.enrollments)
        .where(eq(schema.enrollments.userId, userId))
        .all()
    )
      .filter((e) => e.status === "active" || e.status === "completed")
      .map((e) => e.courseId),
  );

  const result = [];
  for (const p of paths) {
    const template = await db
      .select()
      .from(schema.pathTemplates)
      .where(eq(schema.pathTemplates.id, p.templateId))
      .get();
    const rows = await db
      .select()
      .from(schema.userSteps)
      .where(eq(schema.userSteps.userPathId, p.id))
      .orderBy(asc(schema.userSteps.position))
      .all();

    // Walk in order, deriving status. OFFLINE steps (hands-on log, OBCE
    // application, fingerprinting, state exam, BLS) are a **pure checklist**:
    // they happen with the student's supervising DC and the Board, not on this
    // platform, so we never gate or verify them — they stay open as guidance.
    // Only what we can actually observe (account, course/certificate) is
    // tracked as real progress.
    const steps = [];
    let priorComplete = true;
    for (const step of rows) {
      const tstep = await db
        .select({
          stepType: schema.pathTemplateSteps.stepType,
          courseId: schema.pathTemplateSteps.courseId,
        })
        .from(schema.pathTemplateSteps)
        .where(eq(schema.pathTemplateSteps.id, step.templateStepId))
        .get();

      let status: string;
      if (step.status === "waived") {
        status = "waived";
      } else if (tstep?.stepType === "account") {
        status = "complete"; // they're signed in — the account exists
      } else if (tstep?.stepType === "course" && tstep.courseId) {
        if (certified.has(tstep.courseId)) status = "complete";
        else if (!priorComplete) status = "locked";
        else status = enrolled.has(tstep.courseId) ? "in_progress" : "available";
      } else if (step.status === "complete") {
        // Offline step an admin marked done — the platform can't observe these.
        status = "complete";
      } else {
        // Pure checklist: always open, never "Locked".
        status = "available";
      }
      // Gating only matters for course steps; "waived" counts as satisfied.
      priorComplete = status === "complete" || status === "waived";

      let href: string | null = null;
      if (tstep?.stepType === "upload_log") {
        // Hands-on step: send them straight to the Board's signable training log.
        href = OBCE.trainingLog;
      } else if (
        tstep?.stepType === "external_action" ||
        tstep?.stepType === "exam"
      ) {
        // Application / fingerprinting / state exam all happen at the Board.
        href = OBCE.home;
      } else if (tstep?.stepType === "course" && tstep.courseId && status !== "locked") {
        const course = await db
          .select({ slug: schema.courses.slug })
          .from(schema.courses)
          .where(eq(schema.courses.id, tstep.courseId))
          .get();
        if (course) href = `/learn/${course.slug}`;
      } else if (
        // Clinic-management steps (buy seats / invite / track) all live on the
        // dedicated /clinic page. Point any non-locked step there beyond setup.
        template?.slug === "oregon-clinic-owner" &&
        status !== "locked" &&
        step.position > 1
      ) {
        href = "/clinic";
      }
      steps.push({
        ...step,
        status,
        href,
        stepType: tstep?.stepType ?? "custom",
        external: !!href && href.startsWith("http"),
        // Offline steps are guidance the student does elsewhere — the UI labels
        // them "To do" rather than implying the platform is waiting on us.
        offline:
          tstep?.stepType !== "account" && tstep?.stepType !== "course",
      });
    }
    result.push({ path: p, template, steps });
  }
  return result;
}
