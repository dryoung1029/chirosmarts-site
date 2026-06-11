/**
 * Start a course purchase. With Stripe configured, creates a pending enrollment
 * and redirects to Stripe Checkout. Without keys (dev), the enrollment is comped
 * so the paywall/entitlement flow is testable end-to-end.
 */
import type { APIRoute } from "astro";
import { eq } from "drizzle-orm";
import { getDb } from "@/db/client";
import { schema } from "@/db/client";
import { getSiteUrl } from "@/lib/env";
import { isStripeConfigured, createCourseCheckout } from "@/lib/stripe";
import {
  ensurePendingEnrollment,
  activateEnrollment,
} from "@/lib/enrollment";

export const POST: APIRoute = async ({ request, locals, redirect }) => {
  const user = locals.user;
  if (!user) return redirect("/login", 302);

  const env = locals.runtime.env;
  const db = getDb(env);
  const form = await request.formData();
  const courseId = String(form.get("courseId") ?? "");

  const course = await db
    .select()
    .from(schema.courses)
    .where(eq(schema.courses.id, courseId))
    .get();
  if (!course) return redirect("/dashboard", 302);
  const courseUrl = `/learn/${course.slug}`;

  // Dev/comp path: no Stripe key → grant access immediately (test mode).
  if (!isStripeConfigured(env)) {
    await activateEnrollment(db, user.id, course.id, {
      paymentStatus: "comp",
      amountCents: course.priceCents,
    });
    return redirect(`${courseUrl}?comped=1`, 303);
  }

  const enrollmentId = await ensurePendingEnrollment(
    db,
    user.id,
    course.id,
    course.priceCents,
  );

  const site = getSiteUrl(env);
  const url = await createCourseCheckout(env, {
    courseTitle: course.title,
    priceCents: course.priceCents,
    customerEmail: user.email,
    clientReferenceId: user.id,
    metadata: {
      kind: "course",
      userId: user.id,
      courseId: course.id,
      enrollmentId,
    },
    successUrl: `${site}/checkout/success?course=${course.slug}`,
    cancelUrl: `${site}${courseUrl}?canceled=1`,
  });
  return redirect(url, 303);
};
