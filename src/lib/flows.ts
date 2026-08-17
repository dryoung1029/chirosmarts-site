/**
 * Lifecycle flow engine — run once a day by the cron tick endpoint.
 *
 *  - Review request: 3–14 days after a certificate is issued (the window keeps
 *    the first run from blasting the entire back-catalog of past completers).
 *  - Renewal reminder: up to 60 days before a CA's birth-month renewal, once per
 *    cycle, for anyone we have a birth month for (account holders + legacy
 *    contacts who set their month via the capture page).
 *
 * Idempotent: every send logs a `flow_email` event keyed uniquely; we never
 * re-send the same key. Compliance data (events) is append-only.
 */
import { and, eq, gte, lte, isNotNull } from "drizzle-orm";
import type { Db } from "@/db/client";
import { schema } from "@/db/client";
import { getSiteUrl } from "@/lib/env";
import { logEvent } from "@/lib/events";
import { nextRenewalDeadline } from "@/lib/renewal";
import { makeContactToken } from "@/lib/contact-token";
import { sendReviewRequestEmail, sendRenewalReminderEmail } from "@/lib/email/flows";

const DAY = 86400000;
const isoMinusDays = (now: Date, d: number) => new Date(now.getTime() - d * DAY).toISOString();

// A certificate younger than this is still in its initial cycle — the next
// birth-month is NOT a renewal yet, so renewal reminders are suppressed until
// the cert is at least this old (~10 months, leaving room for the 60-day
// pre-deadline window to land near the ~1-year mark).
const RENEWAL_MIN_CERT_AGE_DAYS = 300;

export interface FlowRunResult {
  reviewSent: number;
  renewalSent: number;
  skipped: number;
  errors: string[];
}

export async function runDailyFlows(
  env: CloudflareEnv,
  db: Db,
  now: Date = new Date(),
): Promise<FlowRunResult> {
  const site = getSiteUrl(env).replace(/\/$/, "");
  const res: FlowRunResult = { reviewSent: 0, renewalSent: 0, skipped: 0, errors: [] };

  // Idempotency: keys we've already sent.
  const prior = await db
    .select({ payload: schema.events.payload })
    .from(schema.events)
    .where(eq(schema.events.type, "flow_email"))
    .all();
  const sent = new Set<string>();
  for (const e of prior) {
    const k = (e.payload as { key?: string } | null)?.key;
    if (k) sent.add(k);
  }

  // ---- Review requests (cert issued 3–14 days ago) ----
  const reviewRows = await db
    .select({
      certId: schema.certificates.id,
      title: schema.certificates.courseTitleSnapshot,
      name: schema.certificates.legalNameSnapshot,
      userId: schema.users.id,
      email: schema.users.email,
      displayName: schema.users.displayName,
    })
    .from(schema.certificates)
    .innerJoin(schema.users, eq(schema.certificates.userId, schema.users.id))
    .where(
      and(
        eq(schema.certificates.status, "issued"),
        gte(schema.certificates.issuedAt, isoMinusDays(now, 14)),
        lte(schema.certificates.issuedAt, isoMinusDays(now, 3)),
      ),
    )
    .all();

  for (const r of reviewRows) {
    const key = `review:${r.certId}`;
    if (sent.has(key)) {
      res.skipped++;
      continue;
    }
    try {
      const token = await makeContactToken(env, r.email);
      const reviewUrl = `${site}/review?e=${encodeURIComponent(r.email)}&t=${token}`;
      const out = await sendReviewRequestEmail(env, {
        to: r.email,
        name: (r.displayName || r.name || "").split(" ")[0],
        courseTitle: r.title,
        reviewUrl,
      });
      await logEvent(db, { userId: r.userId, type: "flow_email", payload: { flow: "review", key, to: r.email, delivered: out.delivered } });
      sent.add(key);
      res.reviewSent++;
    } catch (e) {
      res.errors.push(`review ${r.email}: ${(e as Error).message}`);
    }
  }

  // ---- Renewal reminders (≤60 days before birth-month renewal) ----
  const todayUTC = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
  const renewalUrl = `${site}/renewal?utm_source=email&utm_campaign=renewal`;

  type Cand = { email: string; name: string | null; birthMonth: number; userId: string | null };
  const cands = new Map<string, Cand>();

  // A renewal reminder must only go to someone whose UPCOMING birth-month is a
  // genuine annual renewal — not their initial cycle. Two guards:
  //   1. They must be certified (every student enters a birth month at intake,
  //      so birth-month alone would email brand-new/unfinished students).
  //   2. Their certificate must be old enough that the next birth-month is a
  //      real renewal. A freshly certified student whose birthday is soon isn't
  //      due to renew yet — their first renewal is a cycle away.
  const isFreshCert = (issuedAtIso: string | null): boolean => {
    if (!issuedAtIso) return false; // unknown date → treat as historical (legacy)
    const age = now.getTime() - new Date(issuedAtIso).getTime();
    return age < RENEWAL_MIN_CERT_AGE_DAYS * DAY;
  };

  // userId -> most recent issued-certificate date.
  const latestCertByUser = new Map<string, string>();
  for (const c of await db
    .select({ userId: schema.certificates.userId, issuedAt: schema.certificates.issuedAt })
    .from(schema.certificates)
    .where(eq(schema.certificates.status, "issued"))
    .all()) {
    const prev = latestCertByUser.get(c.userId);
    if (!prev || c.issuedAt > prev) latestCertByUser.set(c.userId, c.issuedAt);
  }

  // Account holders who gave their birth month AND are certified long enough ago.
  for (const u of await db
    .select({ id: schema.users.id, email: schema.users.email, displayName: schema.users.displayName, legalName: schema.users.legalName, birthMonth: schema.users.birthMonth })
    .from(schema.users)
    .where(isNotNull(schema.users.birthMonth))
    .all()) {
    if (u.birthMonth == null) continue;
    const certDate = latestCertByUser.get(u.id);
    if (!certDate) continue; // never remind uncertified/new students
    if (isFreshCert(certDate)) continue; // freshly certified — not due to renew yet
    cands.set(u.email, { email: u.email, name: u.displayName || u.legalName, birthMonth: u.birthMonth, userId: u.id });
  }
  // Legacy certified contacts who set their month via the capture page. Their
  // completion date (from the old gradebook) applies the same freshness guard.
  for (const c of await db
    .select({ email: schema.importedContacts.email, firstName: schema.importedContacts.firstName, birthMonth: schema.importedContacts.birthMonth, completedAt: schema.importedContacts.completedAt })
    .from(schema.importedContacts)
    .where(and(isNotNull(schema.importedContacts.birthMonth), eq(schema.importedContacts.certified, true)))
    .all()) {
    if (c.birthMonth == null || cands.has(c.email)) continue;
    if (isFreshCert(c.completedAt)) continue; // recently completed — not due to renew yet
    cands.set(c.email, { email: c.email, name: c.firstName, birthMonth: c.birthMonth, userId: null });
  }

  for (const c of cands.values()) {
    const dl = nextRenewalDeadline(c.birthMonth, now);
    if (!dl) continue;
    const daysUntil = (Date.UTC(dl.year, dl.month - 1, dl.day) - todayUTC) / DAY;
    if (daysUntil < 1 || daysUntil > 60) continue;
    const key = `renewal:${c.email}:${dl.year}`;
    if (sent.has(key)) {
      res.skipped++;
      continue;
    }
    try {
      const out = await sendRenewalReminderEmail(env, {
        to: c.email,
        name: (c.name || "").split(" ")[0],
        deadlineLabel: dl.label,
        renewalUrl,
      });
      await logEvent(db, { userId: c.userId, type: "flow_email", payload: { flow: "renewal", key, to: c.email, delivered: out.delivered } });
      sent.add(key);
      res.renewalSent++;
    } catch (e) {
      res.errors.push(`renewal ${c.email}: ${(e as Error).message}`);
    }
  }

  return res;
}
