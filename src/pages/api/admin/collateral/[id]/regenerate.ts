/**
 * Admin: regenerate a collateral draft's body from its original scope, leaving
 * the row (and its id/links) intact. Overwrites bodyMarkdown + model.
 * Access enforced in middleware (site_admin).
 */
import type { APIRoute } from "astro";
import { eq } from "drizzle-orm";
import { getDb, schema } from "@/db/client";
import {
  assembleSource,
  generateCollateral,
  NotConfiguredError,
  NoTranscriptError,
  type CollateralType,
  type CollateralScope,
} from "@/lib/collateral";

const nowIso = () => new Date().toISOString();

export const POST: APIRoute = async ({ params, locals, redirect }) => {
  const env = locals.runtime.env;
  const db = getDb(env);
  const id = params.id!;
  const back = `/admin/collateral/${id}`;

  const row = await db
    .select()
    .from(schema.courseCollateral)
    .where(eq(schema.courseCollateral.id, id))
    .get();
  if (!row) return redirect("/admin/collateral", 303);

  try {
    const source = await assembleSource(
      db,
      row.courseId,
      row.scope as CollateralScope,
      row.scopeRefId,
    );
    const result = await generateCollateral(
      env,
      source,
      row.type as CollateralType,
    );
    await db
      .update(schema.courseCollateral)
      .set({
        bodyMarkdown: result.markdown,
        model: result.model,
        updatedAt: nowIso(),
      })
      .where(eq(schema.courseCollateral.id, id));
    return redirect(`${back}?msg=Regenerated`, 303);
  } catch (err) {
    if (err instanceof NotConfiguredError) {
      return redirect(`${back}?msg=Set+ANTHROPIC_API_KEY+to+regenerate`, 303);
    }
    if (err instanceof NoTranscriptError) {
      return redirect(`${back}?msg=No+transcripts+for+this+scope+anymore`, 303);
    }
    return redirect(`${back}?msg=Regeneration+failed+please+try+again`, 303);
  }
};
