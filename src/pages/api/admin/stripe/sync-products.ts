/** Admin: create/refresh a Stripe Product per course so coupons can be
 *  restricted to a specific course (access enforced in middleware). */
import type { APIRoute } from "astro";
import { getDb } from "@/db/client";
import { syncCoursesToStripe } from "@/lib/stripe-sync";
import { logEvent } from "@/lib/events";

export const POST: APIRoute = async ({ locals, redirect }) => {
  const db = getDb(locals.runtime.env);
  let message: string;
  try {
    const result = await syncCoursesToStripe(locals.runtime.env, db);
    message = result.message;
    await logEvent(db, {
      userId: locals.user!.id,
      type: "stripe_products_sync",
      payload: { created: result.created, updated: result.updated, total: result.total, ok: result.ok },
    }).catch(() => {});
  } catch (e) {
    message = `Stripe product sync failed: ${(e as Error)?.message ?? String(e)}`;
  }
  return redirect(`/admin?done=${encodeURIComponent(message)}`, 303);
};
