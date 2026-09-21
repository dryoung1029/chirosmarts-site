/**
 * Start a course purchase for one or more courses. With Stripe configured,
 * creates a pending enrollment per course and redirects to a single Checkout
 * session; without keys (dev), the enrollments are comped so the paywall flow is
 * testable end-to-end. Accepts `courseId` (single) or `courseIds` (CSV/repeated)
 * so course bundles need no rework later (PLAN.md Q2).
 */
import type { APIRoute } from "astro";
import { inArray } from "drizzle-orm";
import { getDb } from "@/db/client";
import { schema } from "@/db/client";
import { getSiteUrl } from "@/lib/env";
import { logEvent } from "@/lib/events";
import { recordAttribution } from "@/lib/attribution";
import { LEGAL } from "@/config/legal";
import { isStripeConfigured, createCourseCheckout } from "@/lib/stripe";
import {
  ensurePendingEnrollment,
  activateEnrollment,
  expandFulfillment,
} from "@/lib/enrollment";
import { recordCoursePurchase } from "@/lib/sales";

export const POST: APIRoute = async ({ request, locals, redirect, cookies }) => {
  const user = locals.user;
  if (!user) return redirect("/login", 302);

  const env = locals.runtime.env;
  const db = getDb(env);
  await recordAttribution(db, cookies, "purchase", user.id);
  const form = await request.formData();

  // Collect course ids from a single `courseId` and/or `courseIds` (CSV/repeated).
  const ids = new Set<string>();
  const single = String(form.get("courseId") ?? "").trim();
  if (single) ids.add(single);
  for (const v of form.getAll("courseIds")) {
    String(v)
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean)
      .forEach((id) => ids.add(id));
  }
  if (ids.size === 0) return redirect("/courses", 303);

  const found = await db
    .select()
    .from(schema.courses)
    .where(inArray(schema.courses.id, [...ids]))
    .all();
  const buyable = found.filter((c) => c.status === "published");
  if (buyable.length === 0) return redirect("/courses", 303);

  const first = buyable[0];
  const isSingle = buyable.length === 1;

  // Record terms acceptance at each purchase (PLAN.md Item 2).
  await logEvent(db, {
    userId: user.id,
    type: "terms_accepted",
    payload: {
      context: "purchase",
      termsVersion: LEGAL.termsVersion,
      courseIds: buyable.map((c) => c.id),
    },
  });

  // Dev/comp path: no Stripe key → grant access immediately (test mode).
  // Bundles expand to their constituent courses.
  if (!isStripeConfigured(env)) {
    for (const c of buyable) {
      for (const targetId of await expandFulfillment(db, c.id)) {
        await activateEnrollment(db, user.id, targetId, {
          paymentStatus: "comp",
        });
      }
    }
    // Ledger: record comped purchases at the SKU level (zero cash, flagged comp).
    // Non-blocking — a ledger failure must never break the comp grant.
    try {
      await recordCoursePurchase(db, {
        userId: user.id,
        courseIds: buyable.map((c) => c.id),
        source: "comp",
      });
    } catch {
      /* ledger is best-effort; access already granted */
    }
    return redirect(
      isSingle ? `/learn/${first.slug}?comped=1` : `/dashboard?comped=1`,
      303,
    );
  }

  for (const c of buyable) {
    await ensurePendingEnrollment(db, user.id, c.id, c.priceCents);
  }

  const site = getSiteUrl(env);
  const url = await createCourseCheckout(env, {
    courses: buyable.map((c) => ({
      title: c.title,
      priceCents: c.priceCents,
      stripeProductId: c.stripeProductId,
    })),
    customerEmail: user.email,
    clientReferenceId: user.id,
    metadata: {
      kind: "course",
      userId: user.id,
      courseIds: buyable.map((c) => c.id).join(","),
    },
    successUrl: `${site}/checkout/success?course=${first.slug}&session_id={CHECKOUT_SESSION_ID}`,
    cancelUrl: `${site}/courses/${first.slug}?canceled=1`,
  });
  return redirect(url, 303);
};
