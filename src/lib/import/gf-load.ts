/**
 * Load parsed Gravity Forms records into the DB: paid rows → sales ledger,
 * everyone → imported_contacts. Both idempotent so re-running is safe.
 *
 * Writes are BATCHED (chunked multi-row inserts) because a single Cloudflare
 * Workers request caps the number of D1 subrequests — a per-row loop over ~700
 * sales + ~2,000 contacts would exceed it. We read existing state once, compute
 * everything in JS, then insert in chunks.
 */
import { eq, like } from "drizzle-orm";
import type { Db } from "@/db/client";
import { schema } from "@/db/client";
import { newId } from "@/lib/crypto";
import { nowIso } from "@/lib/time";
import { isPaid, isRefunded, type GfRecord } from "@/lib/import/gf-import";
import type { GradebookRecord } from "@/lib/import/gradebook-import";

// Cloudflare D1 caps a single query at 100 BOUND PARAMETERS. Each row is ~14
// params, so keep multi-row inserts tiny (6 rows ≈ 84 params), and group many
// such statements into one db.batch() call so we still make few round-trips
// (a batch counts as a single subrequest).
const ROWS_PER_STMT = 6;
const STMTS_PER_BATCH = 20;

/** Run an array of drizzle statement builders in batched round-trips. */
async function runInBatches(db: Db, statements: unknown[]): Promise<void> {
  for (let i = 0; i < statements.length; i += STMTS_PER_BATCH) {
    const slice = statements.slice(i, i + STMTS_PER_BATCH);
    if (slice.length === 0) continue;
    if (slice.length === 1) {
      await (slice[0] as Promise<unknown>);
      continue;
    }
    // db.batch wants a non-empty tuple; a runtime array is fine.
    await (db as unknown as { batch: (s: unknown[]) => Promise<unknown> }).batch(slice);
  }
}

/** Build chunked multi-row INSERT statements (un-awaited) for a table. */
function insertStatements<T>(insert: (rows: T[]) => unknown, rows: T[]): unknown[] {
  const stmts: unknown[] = [];
  for (let i = 0; i < rows.length; i += ROWS_PER_STMT) {
    stmts.push(insert(rows.slice(i, i + ROWS_PER_STMT)));
  }
  return stmts;
}

export interface SalesLoadResult {
  salesCreated: number;
  refundsCreated: number;
  skipped: number;
}

/** Insert paid/refunded rows as ledger entries, mapped to a course SKU slug. */
export async function loadSales(
  db: Db,
  records: GfRecord[],
  courseSlug: string,
): Promise<SalesLoadResult> {
  const course = await db
    .select({ id: schema.courses.id, slug: schema.courses.slug, title: schema.courses.title })
    .from(schema.courses)
    .where(eq(schema.courses.slug, courseSlug))
    .get();
  const courseId = course?.id ?? null;
  const skuLabel = course?.title ?? "Imported certification";

  // Idempotency: skip markers already in the ledger (one read).
  const existing = await db
    .select({ note: schema.sales.note })
    .from(schema.sales)
    .where(like(schema.sales.note, "gfimport%"))
    .all();
  const seen = new Set(existing.map((r) => r.note ?? ""));

  const marker = (r: GfRecord, kind: "sale" | "refund") =>
    `gfimport${kind === "refund" ? "-refund" : ""}:${r.entryId || r.transactionId || `${r.email}|${r.paymentDateIso ?? r.entryDateIso ?? ""}`}`;

  type Row = typeof schema.sales.$inferInsert;
  const rows: Row[] = [];
  let salesCreated = 0,
    refundsCreated = 0,
    skipped = 0;

  for (const r of records) {
    const paid = isPaid(r);
    const refund = isRefunded(r);
    if (!paid && !refund) continue;
    const note = marker(r, paid ? "sale" : "refund");
    if (seen.has(note)) {
      skipped++;
      continue;
    }
    seen.add(note);
    const amt = r.paymentAmountCents ?? 0;
    rows.push({
      id: newId("sale"),
      kind: paid ? "sale" : "refund",
      source: "manual",
      channel: "direct",
      courseId,
      skuSlug: courseSlug,
      skuLabel,
      quantity: 1,
      unitPriceCents: amt,
      amountCents: paid ? amt : -Math.abs(amt),
      stripePaymentIntentId: r.transactionId || null,
      note,
      occurredAt: r.paymentDateIso ?? r.entryDateIso ?? nowIso(),
    });
    if (paid) salesCreated++;
    else refundsCreated++;
  }

  await runInBatches(
    db,
    insertStatements((chunk) => db.insert(schema.sales).values(chunk), rows),
  );
  return { salesCreated, refundsCreated, skipped };
}

export interface ContactsLoadResult {
  inserted: number;
  updated: number;
  skippedNoEmail: number;
}

const pick = (a: string | null | undefined, b: string | null | undefined) =>
  (a && a.trim()) || (b && b.trim()) || null;
const minIso = (a: string | null, b: string | null) => (!a ? b : !b ? a : a < b ? a : b);
const maxIso = (a: string | null, b: string | null) => (!a ? b : !b ? a : a > b ? a : b);

interface Agg {
  email: string;
  firstName: string | null;
  lastName: string | null;
  clinic: string | null;
  phone: string | null;
  street: string | null;
  city: string | null;
  state: string | null;
  zip: string | null;
  everBought: boolean;
  firstSeen: string | null;
  lastSeen: string | null;
}

/** Upsert one contact per email, merging fields across rows (batched writes). */
export async function loadContacts(
  db: Db,
  records: GfRecord[],
  sourceLabel: string,
): Promise<ContactsLoadResult> {
  const byEmail = new Map<string, Agg>();
  let skippedNoEmail = 0;
  for (const r of records) {
    if (!r.email) {
      skippedNoEmail++;
      continue;
    }
    const seenAt = r.paymentDateIso ?? r.entryDateIso ?? null;
    const cur =
      byEmail.get(r.email) ??
      ({
        email: r.email,
        firstName: null,
        lastName: null,
        clinic: null,
        phone: null,
        street: null,
        city: null,
        state: null,
        zip: null,
        everBought: false,
        firstSeen: null,
        lastSeen: null,
      } as Agg);
    cur.firstName = pick(cur.firstName, r.firstName);
    cur.lastName = pick(cur.lastName, r.lastName);
    cur.clinic = pick(cur.clinic, r.clinic);
    cur.phone = pick(cur.phone, r.phone);
    cur.street = pick(cur.street, r.addressStreet);
    cur.city = pick(cur.city, r.addressCity);
    cur.state = pick(cur.state, r.addressState);
    cur.zip = pick(cur.zip, r.addressZip);
    cur.everBought = cur.everBought || isPaid(r);
    cur.firstSeen = minIso(cur.firstSeen, seenAt);
    cur.lastSeen = maxIso(cur.lastSeen, seenAt);
    byEmail.set(r.email, cur);
  }

  // One read of all existing contacts; partition into inserts vs real updates.
  const existing = await db.select().from(schema.importedContacts).all();
  const exByEmail = new Map(existing.map((e) => [e.email, e]));

  type Ins = typeof schema.importedContacts.$inferInsert;
  const inserts: Ins[] = [];
  const updates: { id: string; set: Partial<Ins> }[] = [];

  for (const a of byEmail.values()) {
    const e = exByEmail.get(a.email);
    if (!e) {
      inserts.push({
        id: newId("ctc"),
        email: a.email,
        firstName: a.firstName,
        lastName: a.lastName,
        clinic: a.clinic,
        phone: a.phone,
        addressStreet: a.street,
        addressCity: a.city,
        addressState: a.state,
        addressZip: a.zip,
        firstSource: sourceLabel,
        everBought: a.everBought,
        firstSeenAt: a.firstSeen,
        lastSeenAt: a.lastSeen,
      });
      continue;
    }
    const set: Partial<Ins> = {
      firstName: pick(e.firstName, a.firstName),
      lastName: pick(e.lastName, a.lastName),
      clinic: pick(e.clinic, a.clinic),
      phone: pick(e.phone, a.phone),
      addressStreet: pick(e.addressStreet, a.street),
      addressCity: pick(e.addressCity, a.city),
      addressState: pick(e.addressState, a.state),
      addressZip: pick(e.addressZip, a.zip),
      everBought: e.everBought || a.everBought,
      firstSeenAt: minIso(e.firstSeenAt, a.firstSeen),
      lastSeenAt: maxIso(e.lastSeenAt, a.lastSeen),
    };
    // Only update when something actually changes (keeps re-runs cheap).
    const changed =
      set.firstName !== e.firstName ||
      set.lastName !== e.lastName ||
      set.clinic !== e.clinic ||
      set.phone !== e.phone ||
      set.addressStreet !== e.addressStreet ||
      set.addressCity !== e.addressCity ||
      set.addressState !== e.addressState ||
      set.addressZip !== e.addressZip ||
      set.everBought !== e.everBought ||
      set.firstSeenAt !== e.firstSeenAt ||
      set.lastSeenAt !== e.lastSeenAt;
    if (changed) updates.push({ id: e.id, set });
  }

  const stmts = insertStatements(
    (chunk) => db.insert(schema.importedContacts).values(chunk),
    inserts,
  );
  for (const u of updates) {
    stmts.push(
      db.update(schema.importedContacts).set(u.set).where(eq(schema.importedContacts.id, u.id)),
    );
  }
  await runInBatches(db, stmts);

  return { inserted: inserts.length, updated: updates.length, skippedNoEmail };
}

export interface GradebookLoadResult {
  certifiedMarked: number;
  inserted: number;
  updated: number;
  skippedNoEmail: number;
}

const splitName = (name: string): { first: string | null; last: string | null } => {
  const t = name.trim().split(/\s+/).filter(Boolean);
  if (t.length === 0) return { first: null, last: null };
  if (t.length === 1) return { first: t[0], last: null };
  return { first: t[0], last: t.slice(1).join(" ") };
};

/**
 * Mark certified completers on the roster from a WP Courseware gradebook export.
 * Matches by email; inserts a contact for completers we haven't seen. Sets the
 * earliest completion date. Non-completers only seed a bare contact if new.
 */
export async function loadGradebook(
  db: Db,
  records: GradebookRecord[],
): Promise<GradebookLoadResult> {
  // Merge by email: certified if any row completed; earliest completion date.
  const byEmail = new Map<string, { email: string; name: string; completed: boolean; completedAt: string | null }>();
  let skippedNoEmail = 0;
  for (const r of records) {
    if (!r.email) {
      skippedNoEmail++;
      continue;
    }
    const cur = byEmail.get(r.email) ?? { email: r.email, name: "", completed: false, completedAt: null };
    cur.name = cur.name || r.name;
    cur.completed = cur.completed || r.completed;
    cur.completedAt = minIso(cur.completedAt, r.completionDateIso);
    byEmail.set(r.email, cur);
  }

  const existing = await db.select().from(schema.importedContacts).all();
  const exByEmail = new Map(existing.map((e) => [e.email, e]));

  type Ins = typeof schema.importedContacts.$inferInsert;
  const inserts: Ins[] = [];
  const updateStmts: unknown[] = [];
  let certifiedMarked = 0;
  let updated = 0;

  for (const a of byEmail.values()) {
    const e = exByEmail.get(a.email);
    if (!e) {
      // Only worth inserting a brand-new contact when they actually completed.
      if (!a.completed) continue;
      const { first, last } = splitName(a.name);
      inserts.push({
        id: newId("ctc"),
        email: a.email,
        firstName: first,
        lastName: last,
        firstSource: "gradebook",
        certified: true,
        completedAt: a.completedAt,
      });
      certifiedMarked++;
      continue;
    }
    const newCertified = e.certified || a.completed;
    const newCompletedAt = minIso(e.completedAt, a.completedAt);
    if (newCertified !== e.certified || newCompletedAt !== e.completedAt) {
      updateStmts.push(
        db
          .update(schema.importedContacts)
          .set({ certified: newCertified, completedAt: newCompletedAt })
          .where(eq(schema.importedContacts.id, e.id)),
      );
      updated++;
      if (a.completed && !e.certified) certifiedMarked++;
    }
  }

  await runInBatches(db, [
    ...insertStatements((chunk) => db.insert(schema.importedContacts).values(chunk), inserts),
    ...updateStmts,
  ]);

  return { certifiedMarked, inserted: inserts.length, updated, skippedNoEmail };
}
