/**
 * Admin: one-time (idempotent) backfill of the revenue ledger from existing PAID
 * enrollments, so the projection has history to compare against on day one.
 *
 * Only imports single-course paid enrollments with a real amount (> 0). Bundle
 * constituents are enrolled at amountCents=0 and are skipped (their revenue would
 * have to be entered against the bundle SKU manually). Idempotent via a per-row
 * `backfill:<enrollmentId>` note marker. Access enforced in middleware.
 */
import type { APIRoute } from "astro";
import { and, eq, gt, inArray, like } from "drizzle-orm";
import { getDb, schema } from "@/db/client";
import { recordSale } from "@/lib/sales";

export const POST: APIRoute = async ({ locals, redirect }) => {
  const db = getDb(locals.runtime.env);

  // Already-imported enrollment ids (note marker) → skip set.
  const existing = await db
    .select({ note: schema.sales.note })
    .from(schema.sales)
    .where(like(schema.sales.note, "backfill:%"))
    .all();
  const done = new Set(existing.map((r) => (r.note ?? "").slice("backfill:".length)));

  // Paid, real-money enrollments (active or completed).
  const paid = await db
    .select()
    .from(schema.enrollments)
    .where(
      and(
        eq(schema.enrollments.paymentStatus, "paid"),
        gt(schema.enrollments.amountCents, 0),
        inArray(schema.enrollments.status, ["active", "completed", "refunded"]),
      ),
    )
    .all();

  // Snapshot course slug/title for each referenced course.
  const courseIds = [...new Set(paid.map((e) => e.courseId))];
  const courses = courseIds.length
    ? await db
        .select({ id: schema.courses.id, slug: schema.courses.slug, title: schema.courses.title })
        .from(schema.courses)
        .where(inArray(schema.courses.id, courseIds))
        .all()
    : [];
  const courseById = new Map(courses.map((c) => [c.id, c]));

  let imported = 0;
  for (const e of paid) {
    if (done.has(e.id)) continue;
    const c = courseById.get(e.courseId);
    const occurredAt = e.activatedAt ?? e.enrolledAt;
    await recordSale(db, {
      kind: "sale",
      source: "stripe",
      channel: "direct",
      userId: e.userId,
      courseId: e.courseId,
      skuSlug: c?.slug ?? null,
      skuLabel: c?.title ?? null,
      quantity: 1,
      unitPriceCents: e.amountCents ?? 0,
      amountCents: e.amountCents ?? 0,
      stripeCheckoutSessionId: e.stripeCheckoutSessionId,
      stripePaymentIntentId: e.stripePaymentIntentId,
      note: `backfill:${e.id}`,
      occurredAt,
    });
    imported++;
    // If this enrollment was later refunded, append the offsetting row too.
    if (e.status === "refunded") {
      await recordSale(db, {
        kind: "refund",
        source: "stripe",
        channel: "direct",
        userId: e.userId,
        courseId: e.courseId,
        skuSlug: c?.slug ?? null,
        skuLabel: c?.title ?? null,
        quantity: 1,
        unitPriceCents: e.amountCents ?? 0,
        amountCents: -(e.amountCents ?? 0),
        stripePaymentIntentId: e.stripePaymentIntentId,
        note: `backfill-refund:${e.id}`,
      });
    }
  }

  const msg =
    imported > 0
      ? `Imported ${imported} paid enrollment${imported === 1 ? "" : "s"} into the ledger.`
      : "Nothing to import — all paid enrollments are already in the ledger.";
  return redirect(`/admin/revenue?msg=${encodeURIComponent(msg)}`, 303);
};
