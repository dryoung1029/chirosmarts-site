/**
 * Admin: generate a new collateral draft from a course's transcripts.
 * Form POST (courseId, type, scope_ref) → assemble source → Claude →
 * insert a `course_collateral` draft → redirect to the editor.
 * Access enforced in middleware (site_admin).
 */
import type { APIRoute } from "astro";
import { eq } from "drizzle-orm";
import { getDb, schema } from "@/db/client";
import { newId } from "@/lib/crypto";
import {
  assembleSource,
  generateCollateral,
  NotConfiguredError,
  NoTranscriptError,
  type CollateralType,
  type CollateralScope,
} from "@/lib/collateral";

const TYPES: CollateralType[] = ["study_guide", "checklist", "cheat_sheet"];

const json = (data: unknown, status = 200) =>
  new Response(JSON.stringify(data), {
    status,
    headers: { "content-type": "application/json" },
  });

export const POST: APIRoute = async ({ request, locals, redirect }) => {
  const env = locals.runtime.env;
  const db = getDb(env);
  const back = "/admin/collateral";

  const form = await request.formData();
  const courseId = String(form.get("courseId") ?? "").trim();
  const typeRaw = String(form.get("type") ?? "");
  const scopeRef = String(form.get("scope_ref") ?? "course").trim();
  // JSON mode lets the browser orchestrate many per-module generations and read
  // each result (used by "Generate all modules"); default is the form redirect.
  const wantsJson = form.get("format") === "json";

  if (!courseId || !TYPES.includes(typeRaw as CollateralType)) {
    return wantsJson
      ? json({ ok: false, error: "Pick a course and a collateral type" }, 400)
      : redirect(`${back}?msg=Pick+a+course+and+a+collateral+type`, 303);
  }
  const type = typeRaw as CollateralType;

  // scope_ref is "course" or "module:<id>".
  let scope: CollateralScope = "course";
  let scopeRefId: string | null = null;
  if (scopeRef.startsWith("module:")) {
    scope = "module";
    scopeRefId = scopeRef.slice("module:".length);
  }

  try {
    const source = await assembleSource(db, courseId, scope, scopeRefId);
    const result = await generateCollateral(env, source, type);

    // Append at the end of the course's existing collateral.
    const siblings = await db
      .select({ s: schema.courseCollateral.sortOrder })
      .from(schema.courseCollateral)
      .where(eq(schema.courseCollateral.courseId, courseId))
      .all();
    const sortOrder = siblings.reduce((m, r) => Math.max(m, r.s), -1) + 1;

    const id = newId("coll");
    await db.insert(schema.courseCollateral).values({
      id,
      courseId,
      scope,
      scopeRefId,
      type,
      title: result.title,
      status: "draft",
      bodyMarkdown: result.markdown,
      sortOrder,
      model: result.model,
      sourceMeta: JSON.stringify({
        lessonIds: source.lessons.map((l) => l.id),
        scopeLabel: source.scopeLabel,
        generatedAt: new Date().toISOString(),
      }),
    });
    return wantsJson
      ? json({ ok: true, id, title: result.title })
      : redirect(`/admin/collateral/${id}?msg=Draft+generated`, 303);
  } catch (err) {
    if (err instanceof NotConfiguredError) {
      return wantsJson
        ? json({ ok: false, error: "ANTHROPIC_API_KEY is not set" }, 503)
        : redirect(`${back}?msg=Set+ANTHROPIC_API_KEY+to+generate+collateral`, 303);
    }
    if (err instanceof NoTranscriptError) {
      return wantsJson
        ? json({ ok: false, error: "No transcripts for this scope" }, 422)
        : redirect(`${back}?msg=That+scope+has+no+transcripts+to+work+from`, 303);
    }
    return wantsJson
      ? json(
          {
            ok: false,
            error: err instanceof Error ? err.message : "Generation failed",
          },
          500,
        )
      : redirect(`${back}?msg=Generation+failed+please+try+again`, 303);
  }
};
