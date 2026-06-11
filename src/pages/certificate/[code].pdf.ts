/**
 * Public certificate PDF. Served by verification code (unguessable), so it is
 * safe to expose without auth — the certificate is publicly verifiable by
 * design. Revoked certificates are withheld.
 */
import type { APIRoute } from "astro";
import { getDb } from "@/db/client";
import { getCertificateByCode, getCertificatePdf } from "@/lib/certificate";

export const GET: APIRoute = async ({ params, locals }) => {
  const code = params.code!;
  const db = getDb(locals.runtime.env);
  const cert = await getCertificateByCode(db, code);
  if (!cert || cert.status === "revoked" || !cert.r2Key) {
    return new Response("Certificate not found", { status: 404 });
  }
  const pdf = await getCertificatePdf(locals.runtime.env, cert.r2Key);
  if (!pdf) return new Response("Certificate not found", { status: 404 });
  return new Response(pdf, {
    headers: {
      "content-type": "application/pdf",
      "content-disposition": `inline; filename="ChiroSmarts-Certificate-${cert.certNumber}.pdf"`,
      "cache-control": "private, max-age=0, must-revalidate",
    },
  });
};
