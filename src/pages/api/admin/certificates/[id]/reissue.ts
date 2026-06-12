/** Admin: reissue a certificate — supersede the old, mint + email a fresh one. */
import type { APIRoute } from "astro";
import { eq } from "drizzle-orm";
import { getDb, schema } from "@/db/client";
import { reissueCertificate } from "@/lib/certificate";

export const POST: APIRoute = async ({ params, locals, redirect }) => {
  const db = getDb(locals.runtime.env);
  const id = params.id!;
  const cert = await db
    .select({ userId: schema.certificates.userId })
    .from(schema.certificates)
    .where(eq(schema.certificates.id, id))
    .get();
  const result = await reissueCertificate(locals.runtime.env, db, id, locals.user!.id);
  const dest = cert
    ? `/admin/students/${cert.userId}?done=${result ? "Certificate+reissued" : "Reissue+failed"}`
    : "/admin/students";
  return redirect(dest, 303);
};
