/**
 * Admin: permanently delete a user and all their data (access enforced in
 * middleware). Requires typing the user's email to confirm, and refuses to
 * delete the currently signed-in admin's own account.
 */
import type { APIRoute } from "astro";
import { eq } from "drizzle-orm";
import { getDb, schema } from "@/db/client";
import { deleteUser } from "@/lib/admin/user-admin";

export const POST: APIRoute = async ({ params, request, locals, redirect }) => {
  const env = locals.runtime.env;
  const db = getDb(env);
  const id = params.id!;

  const back = (msg: string) =>
    redirect(`/admin/students/${id}?done=${encodeURIComponent(msg)}`, 303);

  if (locals.user?.id === id) return back("You can't delete your own admin account.");

  const user = await db
    .select({ email: schema.users.email })
    .from(schema.users)
    .where(eq(schema.users.id, id))
    .get();
  if (!user) return redirect("/admin/students?done=User+not+found", 303);

  const form = await request.formData();
  const confirm = String(form.get("confirmEmail") ?? "").trim().toLowerCase();
  if (confirm !== user.email.toLowerCase()) {
    return back("Delete canceled — the confirmation email didn't match.");
  }

  await deleteUser(env, id);
  return redirect(
    `/admin/students?done=${encodeURIComponent(`Deleted ${user.email} and all their data.`)}`,
    303,
  );
};
