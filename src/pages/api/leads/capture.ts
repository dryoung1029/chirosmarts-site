/** Public lead capture → double opt-in. Stores a pending lead and emails the
 * confirmation link. Source-gated to the known funnel entry points. */
import type { APIRoute } from "astro";
import { getDb } from "@/db/client";
import { captureLead, type LeadSource } from "@/lib/leads";

const SOURCES: LeadSource[] = ["renewal_checker", "checklist_pdf", "other"];

export const POST: APIRoute = async ({ request, locals }) => {
  const db = getDb(locals.runtime.env);
  let body: { email?: unknown; source?: unknown; birthMonth?: unknown };
  try {
    body = await request.json();
  } catch {
    return json({ ok: false, message: "Invalid request." }, 400);
  }
  const email = typeof body.email === "string" ? body.email : "";
  const source = (SOURCES as string[]).includes(String(body.source))
    ? (body.source as LeadSource)
    : "other";
  const birthMonth =
    body.birthMonth == null ? null : Number(body.birthMonth);

  const result = await captureLead(locals.runtime.env, db, {
    email,
    source,
    birthMonth,
  });
  return json(result, result.ok ? 200 : 400);
};

function json(data: unknown, status: number) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "content-type": "application/json" },
  });
}
