/**
 * Serve the lead-magnet asset (Oregon CA certification checklist) to a CONFIRMED
 * checklist lead. Gated: requires a valid lead id whose status is `confirmed`
 * and source is `checklist_pdf`. The asset lives in R2 at a fixed key the owner
 * uploads to.
 */
import type { APIRoute } from "astro";
import { eq } from "drizzle-orm";
import { getDb, schema } from "@/db/client";

const ASSET_KEY = "lead-magnets/oregon-ca-checklist.pdf";

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

  const obj = await env.DOCS.get(ASSET_KEY);
  if (!obj) {
    return new Response(
      "The checklist isn't available yet — please check back shortly.",
      { status: 404 },
    );
  }
  return new Response(await obj.arrayBuffer(), {
    headers: {
      "content-type": "application/pdf",
      "content-disposition": 'attachment; filename="ChiroSmarts-Oregon-CA-Checklist.pdf"',
      "cache-control": "private, max-age=0, must-revalidate",
    },
  });
};
