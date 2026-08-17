/**
 * Sync courses to Stripe Products so coupons can be restricted to a specific
 * course. Creates one persistent Product per non-archived course and stores its
 * id on the course row. Idempotent: re-running reuses (and refreshes) existing
 * Products. Prices are NOT synced — amounts stay DB-driven and are sent inline
 * at checkout. Admin-triggered only.
 */
import { eq, ne } from "drizzle-orm";
import type { Db } from "@/db/client";
import { schema } from "@/db/client";
import { isStripeConfigured, ensureStripeProduct } from "@/lib/stripe";

export interface StripeSyncResult {
  ok: boolean;
  created: number;
  updated: number;
  total: number;
  message: string;
}

export async function syncCoursesToStripe(env: CloudflareEnv, db: Db): Promise<StripeSyncResult> {
  if (!isStripeConfigured(env)) {
    return { ok: false, created: 0, updated: 0, total: 0, message: "Stripe is not configured (STRIPE_SECRET_KEY unset)." };
  }

  const courses = await db
    .select({
      id: schema.courses.id,
      title: schema.courses.title,
      slug: schema.courses.slug,
      stripeProductId: schema.courses.stripeProductId,
    })
    .from(schema.courses)
    .where(ne(schema.courses.status, "archived"))
    .all();

  let created = 0;
  let updated = 0;
  for (const c of courses) {
    const res = await ensureStripeProduct(env, {
      id: c.id,
      title: c.title,
      slug: c.slug,
      existingProductId: c.stripeProductId,
    });
    if (res.created || res.productId !== c.stripeProductId) {
      await db
        .update(schema.courses)
        .set({ stripeProductId: res.productId })
        .where(eq(schema.courses.id, c.id));
    }
    if (res.created) created++;
    else updated++;
  }

  return {
    ok: true,
    created,
    updated,
    total: courses.length,
    message: `Synced ${courses.length} course(s) to Stripe — ${created} created, ${updated} updated. You can now create course-specific coupons in Stripe.`,
  };
}
