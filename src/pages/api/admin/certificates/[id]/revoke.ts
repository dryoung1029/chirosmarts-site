/** Admin: revoke a certificate (access enforced in middleware). */
import type { APIRoute } from "astro";
import { eq } from "drizzle-orm";
import { getDb, schema } from "@/db/client";
import { revokeCertificate } from "@/lib/certificate";

export const POST: APIRoute = async ({ params, locals, redirect }) => {
  const db = getDb(locals.runtime.env);
  const id = params.id!;
  const cert = await db
    .select({ userId: schema.certificates.userId })
    .from(schema.certificates)
    .where(eq(schema.certificates.id, id))
    .get();
  await revokeCertificate(db, id, locals.user!.id);
  return redirect(
    cert ? `/admin/students/${cert.userId}?done=Certificate+revoked` : "/admin/students",
    303,
  );
};
