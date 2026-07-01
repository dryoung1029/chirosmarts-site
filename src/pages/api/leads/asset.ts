/**
 * Serve the lead-magnet asset (Oregon CA certification checklist) to a CONFIRMED
 * checklist lead. Gated: requires a valid lead id whose status is `confirmed`
 * and source is `checklist_pdf`.
 *
 * The PDF is GENERATED ON THE FLY from Markdown (src/lib/pdf/checklist.ts) so it
 * is ALWAYS available and always current — no manual R2 upload to forget (an
 * earlier version read a fixed R2 key that was never populated, so the download
 * served a "not available yet" placeholder). We cache the rendered bytes in R2
 * so repeat downloads skip the render; the cache is keyed by content version.
 */
import type { APIRoute } from "astro";
import { eq } from "drizzle-orm";
import { getDb, schema } from "@/db/client";
import { getSiteUrl } from "@/lib/env";
import { renderChecklistPdf } from "@/lib/pdf/checklist";

// Bump when the checklist content changes to invalidate the R2 cache.
const CONTENT_VERSION = "2026-07-01";
const CACHE_KEY = `lead-magnets/oregon-ca-checklist-${CONTENT_VERSION}.pdf`;
const FILENAME = "ChiroSmarts-Oregon-CA-Checklist.pdf";

export const GET: APIRoute = async ({ url, locals }) => {
  const env = locals.runtime.env;
  const db = getDb(env);
  const lid = url.searchParams.get("lid") ?? "";

  const lead = await db
    .select({
      status: schema.marketingLeads.status,
      source: schema.marketingLeads.source,
    })
    .from(schema.marketingLeads)
    .where(eq(schema.marketingLeads.id, lid))
    .get();

  if (!lead || lead.status !== "confirmed" || lead.source !== "checklist_pdf") {
    return new Response("Not found", { status: 404 });
  }

  const pdfResponse = (bytes: Uint8Array | ArrayBuffer) =>
    new Response(bytes, {
      headers: {
        "content-type": "application/pdf",
        "content-disposition": `attachment; filename="${FILENAME}"`,
        "cache-control": "private, max-age=0, must-revalidate",
      },
    });

  // Serve the cached render if we have it.
  try {
    const cached = await env.DOCS?.get(CACHE_KEY);
    if (cached) return pdfResponse(await cached.arrayBuffer());
  } catch {
    /* fall through to render */
  }

  // Render fresh, then best-effort cache for next time.
  const bytes = await renderChecklistPdf(getSiteUrl(env), CONTENT_VERSION);
  try {
    await env.DOCS?.put(CACHE_KEY, bytes, {
      httpMetadata: { contentType: "application/pdf" },
    });
  } catch {
    /* caching is optional — the download still works */
  }
  return pdfResponse(bytes);
};
