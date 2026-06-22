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
import {
  activateEnrollment,
  expandFulfillment,
  revokeEnrollmentByPaymentIntent,
} from "@/lib/enrollment";
import { grantPoolSeats } from "@/lib/seat-pools";
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

    if (meta.kind === "course" && meta.userId && (meta.courseIds || meta.courseId)) {
      // `courseIds` (CSV) is the bundle-ready form; `courseId` kept for any
      // older in-flight session. Activate each course in the session.
      const courseIds = (meta.courseIds ?? meta.courseId ?? "")
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean);
      for (const courseId of courseIds) {
        // Bundles expand to their constituent courses (one purchase → many).
        for (const targetId of await expandFulfillment(db, courseId)) {
          await activateEnrollment(db, meta.userId, targetId, {
            paymentStatus: "paid",
            stripeCheckoutSessionId: session.id,
            stripePaymentIntentId: session.payment_intent ?? undefined,
          });
        }
      }
    } else if (
      meta.kind === "seats" &&
      meta.clinicId &&
      meta.courseId &&
      meta.count
    ) {
      const clinic = await db
        .select()
        .from(schema.clinics)
        .where(eq(schema.clinics.id, meta.clinicId))
        .get();
      if (clinic) {
        const count = Number(meta.count);
        await grantPoolSeats(db, clinic.id, meta.courseId, count);
        await logEvent(db, {
          userId: clinic.ownerUserId,
          type: "clinic_pool_seats_granted",
          courseId: meta.courseId,
          payload: { clinicId: clinic.id, count, method: "stripe" },
        });
      }
    }
  } else if (event.type === "charge.refunded") {
    const charge = event.data.object as { payment_intent?: string | null };
    if (charge.payment_intent) {
      // Student-level course refund → revoke that enrollment (PLAN #9).
      const revoked = await revokeEnrollmentByPaymentIntent(
        db,
        charge.payment_intent,
      );
      // A refund that matches no enrollment is most likely a clinic SEAT-POOL
      // purchase. Per the Phase 4 record, seat-pool refunds are handled MANUALLY:
      // no automatic pool shrinking and no enrollment/cert revocation — just log
      // for an admin to reconcile.
      if (!revoked) {
        await logEvent(db, {
          type: "clinic_seat_refund_manual_review",
          payload: { paymentIntentId: charge.payment_intent },
        });
      }
    }
  }

  return new Response(JSON.stringify({ received: true }), {
    status: 200,
    headers: { "content-type": "application/json" },
  });
};
