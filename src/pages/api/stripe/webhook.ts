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
import { eq, inArray } from "drizzle-orm";
import { getDb } from "@/db/client";
import { schema } from "@/db/client";
import { notifyAdmins } from "@/lib/email/admin-notify";
import { constructWebhookEvent } from "@/lib/stripe";
import {
  activateEnrollment,
  expandFulfillment,
  revokeEnrollmentByPaymentIntent,
} from "@/lib/enrollment";
import { grantPoolSeats } from "@/lib/seat-pools";
import {
  recordCoursePurchase,
  recordSeatPurchase,
  recordRefundByPaymentIntent,
  hasSaleForCheckoutSession,
  hasRefundForPaymentIntent,
} from "@/lib/sales";
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

  try {
    await handleEvent(env, db, event);
  } catch (e) {
    // Surface the real cause: log it AND return it in the body so it's visible
    // on the Stripe dashboard's delivery attempt (and triggers a retry in case
    // the failure was transient — fulfilment is idempotent).
    const message = (e as Error)?.stack ?? (e as Error)?.message ?? String(e);
    await logEvent(db, {
      type: "stripe_webhook_error",
      payload: { eventType: event.type, message: String(message).slice(0, 900) },
    }).catch(() => {});
    return new Response(`fulfilment error: ${message}`, { status: 500 });
  }

  return new Response(JSON.stringify({ received: true }), {
    status: 200,
    headers: { "content-type": "application/json" },
  });
};

async function handleEvent(
  env: CloudflareEnv,
  db: ReturnType<typeof getDb>,
  event: Awaited<ReturnType<typeof constructWebhookEvent>>,
): Promise<void> {
  if (event.type === "checkout.session.completed") {
    const session = event.data.object as {
      metadata?: Record<string, string> | null;
      payment_intent?: string | null;
      id?: string;
      amount_total?: number | null;
    };
    const meta = session.metadata ?? {};

    if (meta.kind === "course" && meta.userId && (meta.courseIds || meta.courseId)) {
      // The buyer may no longer exist (e.g. a test account deleted after a test
      // purchase). Activating would fail the enrollment's user FK and 500 the
      // webhook forever, so skip gracefully and log for reconciliation instead.
      const buyer = await db
        .select({ id: schema.users.id, email: schema.users.email })
        .from(schema.users)
        .where(eq(schema.users.id, meta.userId))
        .get();
      if (!buyer) {
        await logEvent(db, {
          type: "stripe_webhook_orphan_user",
          payload: { userId: meta.userId, checkoutSessionId: session.id ?? null },
        }).catch(() => {});
        return;
      }
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
      // Revenue ledger: one row per PURCHASED SKU (bundles stay bundles). Guard
      // against Stripe redelivering the event so revenue is never double-counted.
      // Wrapped so a ledger failure can never break fulfilment (or wedge Stripe
      // retries) — access has already been granted above.
      try {
        if (session.id && !(await hasSaleForCheckoutSession(db, session.id))) {
          await recordCoursePurchase(db, {
            userId: meta.userId,
            courseIds,
            source: "stripe",
            stripeCheckoutSessionId: session.id,
            stripePaymentIntentId: session.payment_intent ?? null,
          });
        }
      } catch (e) {
        await logEvent(db, {
          userId: meta.userId,
          type: "sales_ledger_error",
          payload: { where: "course", message: String((e as Error)?.message ?? e) },
        }).catch(() => {});
      }
      // Operational alert: we made a sale. Best-effort.
      const dollars =
        session.amount_total != null ? `$${(session.amount_total / 100).toFixed(2)}` : "—";
      const titles = courseIds.length
        ? (
            await db
              .select({ title: schema.courses.title })
              .from(schema.courses)
              .where(inArray(schema.courses.id, courseIds))
              .all()
          ).map((t) => t.title)
        : [];
      await notifyAdmins(env, {
        subject: `New purchase — ${dollars}`,
        lines: [
          `<strong>${buyer.email}</strong> purchased ${titles.join(", ") || "a course"}.`,
          `Amount paid: ${dollars}`,
        ],
        ctaPath: "/admin/revenue",
      });
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
        try {
          if (session.id && !(await hasSaleForCheckoutSession(db, session.id))) {
            await recordSeatPurchase(db, {
              clinicId: clinic.id,
              courseId: meta.courseId,
              count,
              source: "stripe",
              stripeCheckoutSessionId: session.id,
              stripePaymentIntentId: session.payment_intent ?? null,
            });
          }
        } catch (e) {
          await logEvent(db, {
            type: "sales_ledger_error",
            payload: { where: "seats", message: String((e as Error)?.message ?? e) },
          }).catch(() => {});
        }
        // Operational alert: a clinic bought seats. Best-effort.
        const dollars =
          session.amount_total != null ? `$${(session.amount_total / 100).toFixed(2)}` : "—";
        await notifyAdmins(env, {
          subject: `New clinic seat purchase — ${count} seat(s)`,
          lines: [
            `Clinic <strong>${clinic.name}</strong> purchased <strong>${count}</strong> training seat(s).`,
            `Amount paid: ${dollars}`,
          ],
          ctaPath: "/admin/revenue",
        });
      }
    }
  } else if (event.type === "charge.refunded") {
    const charge = event.data.object as { payment_intent?: string | null };
    if (charge.payment_intent) {
      // Revenue ledger: append offsetting refund rows (idempotent, non-blocking).
      try {
        if (!(await hasRefundForPaymentIntent(db, charge.payment_intent))) {
          await recordRefundByPaymentIntent(db, charge.payment_intent);
        }
      } catch (e) {
        await logEvent(db, {
          type: "sales_ledger_error",
          payload: { where: "refund", message: String((e as Error)?.message ?? e) },
        }).catch(() => {});
      }
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
}
