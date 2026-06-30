/**
 * Sales ledger — append-only record of actual cash for revenue tracking.
 *
 * Every purchase records one row PER PURCHASED SKU (a bundle stays the bundle,
 * not its constituents) so revenue reconciles cleanly and buckets by SKU against
 * the projection model. Refunds append negative rows; nothing is ever edited.
 */
import { and, desc, eq, gte, lt } from "drizzle-orm";
import type { Db } from "@/db/client";
import { schema } from "@/db/client";
import { newId } from "@/lib/crypto";
import { nowIso } from "@/lib/time";

export type Sale = typeof schema.sales.$inferSelect;

export interface RecordSaleInput {
  kind?: "sale" | "refund" | "adjustment";
  source: "stripe" | "comp" | "clinic_seat" | "free" | "manual";
  channel?: "direct" | "clinic";
  userId?: string | null;
  clinicId?: string | null;
  courseId?: string | null;
  skuSlug?: string | null;
  skuLabel?: string | null;
  quantity?: number;
  unitPriceCents: number;
  /** Defaults to quantity × unitPriceCents (sign-flipped for refunds). */
  amountCents?: number;
  stripeCheckoutSessionId?: string | null;
  stripePaymentIntentId?: string | null;
  reversesSaleId?: string | null;
  note?: string | null;
  occurredAt?: string;
}

/** Append a sale/refund/adjustment row. Returns the new row id. */
export async function recordSale(db: Db, input: RecordSaleInput): Promise<string> {
  const kind = input.kind ?? "sale";
  const quantity = input.quantity ?? 1;
  const unit = Math.round(input.unitPriceCents);
  const magnitude = Math.abs(unit) * quantity;
  const amount =
    input.amountCents != null
      ? Math.round(input.amountCents)
      : kind === "refund"
        ? -magnitude
        : magnitude;
  const id = newId("sale");
  await db.insert(schema.sales).values({
    id,
    kind,
    source: input.source,
    channel: input.channel ?? "direct",
    userId: input.userId ?? null,
    clinicId: input.clinicId ?? null,
    courseId: input.courseId ?? null,
    skuSlug: input.skuSlug ?? null,
    skuLabel: input.skuLabel ?? null,
    quantity,
    unitPriceCents: unit,
    amountCents: amount,
    stripeCheckoutSessionId: input.stripeCheckoutSessionId ?? null,
    stripePaymentIntentId: input.stripePaymentIntentId ?? null,
    reversesSaleId: input.reversesSaleId ?? null,
    note: input.note ?? null,
    occurredAt: input.occurredAt ?? nowIso(),
  });
  return id;
}

/**
 * Record a course/bundle purchase as one ledger row per purchased SKU. Looks up
 * each course's CURRENT price for the snapshot (no discounts in this system, so
 * the per-SKU price reconstructs the Stripe total). `courseIds` are the SKUs the
 * customer actually bought — bundles are NOT expanded here.
 */
export async function recordCoursePurchase(
  db: Db,
  opts: {
    userId: string;
    courseIds: string[];
    source: "stripe" | "comp" | "free";
    stripeCheckoutSessionId?: string | null;
    stripePaymentIntentId?: string | null;
  },
): Promise<void> {
  for (const courseId of opts.courseIds) {
    const course = await db
      .select({
        id: schema.courses.id,
        slug: schema.courses.slug,
        title: schema.courses.title,
        priceCents: schema.courses.priceCents,
      })
      .from(schema.courses)
      .where(eq(schema.courses.id, courseId))
      .get();
    if (!course) continue;
    // Comps move no cash; record the unit (price snapshot) but amount 0.
    const cash = opts.source === "stripe" ? course.priceCents : 0;
    await recordSale(db, {
      source: opts.source,
      channel: "direct",
      userId: opts.userId,
      courseId: course.id,
      skuSlug: course.slug,
      skuLabel: course.title,
      quantity: 1,
      unitPriceCents: course.priceCents,
      amountCents: cash,
      stripeCheckoutSessionId: opts.stripeCheckoutSessionId ?? null,
      stripePaymentIntentId: opts.stripePaymentIntentId ?? null,
    });
  }
}

/** Record a clinic seat-pool purchase (count × course price, B2B channel). */
export async function recordSeatPurchase(
  db: Db,
  opts: {
    clinicId: string;
    courseId: string;
    count: number;
    source: "stripe" | "comp";
    stripeCheckoutSessionId?: string | null;
    stripePaymentIntentId?: string | null;
  },
): Promise<void> {
  const course = await db
    .select({
      id: schema.courses.id,
      slug: schema.courses.slug,
      title: schema.courses.title,
      priceCents: schema.courses.priceCents,
    })
    .from(schema.courses)
    .where(eq(schema.courses.id, opts.courseId))
    .get();
  if (!course) return;
  const cash = opts.source === "stripe" ? course.priceCents * opts.count : 0;
  await recordSale(db, {
    source: opts.source === "stripe" ? "clinic_seat" : "comp",
    channel: "clinic",
    clinicId: opts.clinicId,
    courseId: course.id,
    skuSlug: course.slug,
    skuLabel: `${course.title} (clinic seats)`,
    quantity: opts.count,
    unitPriceCents: course.priceCents,
    amountCents: cash,
    stripeCheckoutSessionId: opts.stripeCheckoutSessionId ?? null,
    stripePaymentIntentId: opts.stripePaymentIntentId ?? null,
  });
}

/**
 * Append refund rows reversing every prior Stripe sale with this payment intent.
 * Returns the count reversed (0 if none matched — e.g. a clinic seat refund the
 * webhook flags for manual review).
 */
export async function recordRefundByPaymentIntent(
  db: Db,
  paymentIntentId: string,
): Promise<number> {
  const prior = await db
    .select()
    .from(schema.sales)
    .where(
      and(
        eq(schema.sales.stripePaymentIntentId, paymentIntentId),
        eq(schema.sales.kind, "sale"),
      ),
    )
    .all();
  let n = 0;
  for (const s of prior) {
    await recordSale(db, {
      kind: "refund",
      source: s.source as RecordSaleInput["source"],
      channel: s.channel as "direct" | "clinic",
      userId: s.userId,
      clinicId: s.clinicId,
      courseId: s.courseId,
      skuSlug: s.skuSlug,
      skuLabel: s.skuLabel,
      quantity: s.quantity,
      unitPriceCents: s.unitPriceCents,
      amountCents: -Math.abs(s.amountCents),
      stripePaymentIntentId: paymentIntentId,
      reversesSaleId: s.id,
      note: "Stripe refund",
    });
    n++;
  }
  return n;
}

/**
 * True if any sale row already exists for this Stripe Checkout session — used to
 * make webhook recording idempotent against redelivered events.
 */
export async function hasSaleForCheckoutSession(db: Db, sessionId: string): Promise<boolean> {
  const row = await db
    .select({ id: schema.sales.id })
    .from(schema.sales)
    .where(eq(schema.sales.stripeCheckoutSessionId, sessionId))
    .get();
  return !!row;
}

/** True if a refund row already exists for this payment intent (idempotency). */
export async function hasRefundForPaymentIntent(db: Db, paymentIntentId: string): Promise<boolean> {
  const row = await db
    .select({ id: schema.sales.id })
    .from(schema.sales)
    .where(and(eq(schema.sales.stripePaymentIntentId, paymentIntentId), eq(schema.sales.kind, "refund")))
    .get();
  return !!row;
}

/** All ledger rows in [startIso, endIso). */
export async function getSalesInRange(
  db: Db,
  startIso: string,
  endIso: string,
): Promise<Sale[]> {
  return db
    .select()
    .from(schema.sales)
    .where(and(gte(schema.sales.occurredAt, startIso), lt(schema.sales.occurredAt, endIso)))
    .orderBy(desc(schema.sales.occurredAt))
    .all();
}

/** All-time revenue grouped by calendar year (for the historical trend chart). */
export async function getSalesByYear(
  db: Db,
): Promise<{ year: string; revenueCents: number; units: number }[]> {
  const rows = await db
    .select({
      occurredAt: schema.sales.occurredAt,
      amountCents: schema.sales.amountCents,
      kind: schema.sales.kind,
      quantity: schema.sales.quantity,
    })
    .from(schema.sales)
    .all();
  const byYear = new Map<string, { revenueCents: number; units: number }>();
  for (const r of rows) {
    const year = (r.occurredAt ?? "").slice(0, 4);
    if (!/^\d{4}$/.test(year)) continue;
    const y = byYear.get(year) ?? { revenueCents: 0, units: 0 };
    y.revenueCents += r.amountCents;
    y.units += r.kind === "refund" ? -r.quantity : r.kind === "sale" ? r.quantity : 0;
    byYear.set(year, y);
  }
  return [...byYear.entries()]
    .map(([year, v]) => ({ year, ...v }))
    .sort((a, b) => a.year.localeCompare(b.year));
}

/** Most recent ledger rows for the admin view. */
export async function getRecentSales(db: Db, limit = 50): Promise<Sale[]> {
  return db
    .select()
    .from(schema.sales)
    .orderBy(desc(schema.sales.occurredAt))
    .limit(limit)
    .all();
}
