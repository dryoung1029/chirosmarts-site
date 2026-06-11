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

/** Load a user's paths with their steps, for the dashboard. */
export async function getUserRoadmap(db: Db, userId: string) {
  const paths = await db
    .select()
    .from(schema.userPaths)
    .where(eq(schema.userPaths.userId, userId))
    .all();

  const result = [];
  for (const p of paths) {
    const template = await db
      .select()
      .from(schema.pathTemplates)
      .where(eq(schema.pathTemplates.id, p.templateId))
      .get();
    const steps = await db
      .select()
      .from(schema.userSteps)
      .where(eq(schema.userSteps.userPathId, p.id))
      .orderBy(asc(schema.userSteps.position))
      .all();
    result.push({ path: p, template, steps });
  }
  return result;
}
