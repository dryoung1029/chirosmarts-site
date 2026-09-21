/**
 * Admin: hand-enter a sale, refund, or adjustment into the revenue ledger.
 * Covers off-platform/legacy sales (e.g. the prior $99 cohort) and corrections.
 * Access enforced in middleware. Append-only — corrections are new rows.
 */
import type { APIRoute } from "astro";
import { eq } from "drizzle-orm";
import { getDb, schema } from "@/db/client";
import { recordSale } from "@/lib/sales";

export const POST: APIRoute = async ({ request, locals, redirect }) => {
  const db = getDb(locals.runtime.env);
  const form = await request.formData();

  const kind = (["sale", "refund", "adjustment"] as const).includes(
    String(form.get("kind")) as never,
  )
    ? (String(form.get("kind")) as "sale" | "refund" | "adjustment")
    : "sale";
  const courseId = String(form.get("courseId") ?? "").trim() || null;
  const quantity = Math.max(1, Math.floor(Number(form.get("quantity")) || 1));
  const dollars = Number(form.get("unitDollars"));
  const occurredDate = String(form.get("occurredAt") ?? "").trim();
  const buyerName = String(form.get("buyerName") ?? "").trim() || null;
  const note = String(form.get("note") ?? "").trim() || null;
  const channel = String(form.get("channel")) === "clinic" ? "clinic" : "direct";

  if (!Number.isFinite(dollars) || dollars < 0) {
    return redirect(`/admin/revenue?msg=${encodeURIComponent("Enter a unit price in dollars.")}`, 303);
  }
  const unitPriceCents = Math.round(dollars * 100);

  // Resolve a SKU snapshot from the chosen course (optional).
  let skuSlug: string | null = null;
  let skuLabel: string | null = null;
  if (courseId) {
    const c = await db
      .select({ slug: schema.courses.slug, title: schema.courses.title })
      .from(schema.courses)
      .where(eq(schema.courses.id, courseId))
      .get();
    if (c) {
      skuSlug = c.slug;
      skuLabel = c.title;
    }
  }

  // A date-only value becomes midnight UTC; blank = now.
  const occurredAt = occurredDate ? new Date(`${occurredDate}T12:00:00Z`).toISOString() : undefined;

  await recordSale(db, {
    kind,
    source: "manual",
    channel,
    courseId,
    skuSlug,
    skuLabel: skuLabel ?? (channel === "clinic" ? "Clinic seats" : "Manual entry"),
    buyerName,
    quantity,
    unitPriceCents,
    note,
    occurredAt,
  });

  return redirect(`/admin/revenue?msg=${encodeURIComponent("Ledger updated.")}`, 303);
};
