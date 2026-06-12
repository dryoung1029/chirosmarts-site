/** Admin: manually sync consented contacts to Brevo (access enforced in middleware). */
import type { APIRoute } from "astro";
import { getDb } from "@/db/client";
import { syncToBrevo } from "@/lib/brevo";
import { logEvent } from "@/lib/events";

export const POST: APIRoute = async ({ locals, redirect }) => {
  const db = getDb(locals.runtime.env);
  const result = await syncToBrevo(locals.runtime.env, db);
  await logEvent(db, {
    userId: locals.user!.id,
    type: "brevo_sync",
    payload: { leadsSynced: result.leadsSynced, usersSynced: result.usersSynced, ok: result.ok },
  });
  return redirect(`/admin?done=${encodeURIComponent(result.message)}`, 303);
};
