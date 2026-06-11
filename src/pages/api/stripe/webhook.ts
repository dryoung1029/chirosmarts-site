/**
 * Stripe webhook — the fulfilment source of truth (signature-verified).
 *
 *  - checkout.session.completed (kind=course) → activate the paid enrollment.
 *  - checkout.session.completed (kind=seats)  → grant clinic training seats.
 *  - charge.refunded                          → revoke the enrollment (PLAN #9).
 *
 * Public + unauthenticated (Stripe calls it server-to-server); trust comes from
 * the signature, not a session.
 */
import type { APIRoute } from "astro";
import { eq } from "drizzle-orm";
import { getDb } from "@/db/client";
import { schema } from "@/db/client";
import { constructWebhookEvent } from "@/lib/stripe";
import { activateEnrollment, revokeEnrollmentByPaymentIntent } from "@/lib/enrollment";
import { grantSeats } from "@/lib/clinic";
import { logEvent } from "@/lib/events";

export const POST: APIRoute = async ({ request, locals }) => {
  const env = locals.runtime.env;
  if (!env.STRIPE_SECRET_KEY || !env.STRIPE_WEBHOOK_SECRET) {
    return new Response("stripe not configured", { status: 503 });
  }

  const signature = request.headers.get("stripe-signature");
  if (!signature) return new Response("missing signature", { status: 400 });

  const payload = await request.text();
  let event;
  try {
    event = await constructWebhookEvent(env, payload, signature);
  } catch (e) {
    return new Response(`signature verification failed: ${(e as Error).message}`, {
      status: 400,
    });
  }

  const db = getDb(env);

  if (event.type === "checkout.session.completed") {
    const session = event.data.object as {
      metadata?: Record<string, string> | null;
      payment_intent?: string | null;
      id?: string;
      amount_total?: number | null;
    };
    const meta = session.metadata ?? {};

    if (meta.kind === "course" && meta.userId && meta.courseId) {
      await activateEnrollment(db, meta.userId, meta.courseId, {
        paymentStatus: "paid",
        stripeCheckoutSessionId: session.id,
        stripePaymentIntentId: session.payment_intent ?? undefined,
        amountCents: session.amount_total ?? undefined,
      });
    } else if (meta.kind === "seats" && meta.clinicId && meta.count) {
      const clinic = await db
        .select()
        .from(schema.clinics)
        .where(eq(schema.clinics.id, meta.clinicId))
        .get();
      if (clinic) {
        const count = Number(meta.count);
        await grantSeats(db, clinic, count);
        await logEvent(db, {
          userId: clinic.ownerUserId,
          type: "clinic_seats_granted",
          payload: { clinicId: clinic.id, count, method: "stripe" },
        });
      }
    }
  } else if (event.type === "charge.refunded") {
    const charge = event.data.object as { payment_intent?: string | null };
    if (charge.payment_intent) {
      await revokeEnrollmentByPaymentIntent(db, charge.payment_intent);
    }
  }

  return new Response(JSON.stringify({ received: true }), {
    status: 200,
    headers: { "content-type": "application/json" },
  });
};
