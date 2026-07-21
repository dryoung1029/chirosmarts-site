/** Admin: issue a certificate for a legacy (old-system) completion.
 *  Access enforced in middleware (site_admin). */
import type { APIRoute } from "astro";
import { getDb } from "@/db/client";
import { issueLegacyCertificate } from "@/lib/admin/legacy-certs";

export const POST: APIRoute = async ({ request, locals, redirect }) => {
  const env = locals.runtime.env;
  const db = getDb(env);
  const form = await request.formData();

  const email = String(form.get("email") ?? "");
  const q = String(form.get("q") ?? ""); // preserve the search on redirect
  const back = `/admin/legacy-certs${q ? `?q=${encodeURIComponent(q)}` : ""}`;

  const result = await issueLegacyCertificate(env, db, {
    email,
    legalName: String(form.get("legalName") ?? ""),
    courseId: String(form.get("courseId") ?? ""),
    completedAt: String(form.get("completedAt") ?? ""),
    sendEmail: form.get("sendEmail") === "on",
  });

  const sep = back.includes("?") ? "&" : "?";
  return redirect(`${back}${sep}done=${encodeURIComponent(result.message)}`, 303);
};
