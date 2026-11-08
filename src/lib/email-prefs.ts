/**
 * Marketing-email opt-out ("suppression") — the single answer to "may we send
 * this address marketing email?".
 *
 * A person can be reachable three ways at once: an account
 * (`users.marketing_consent`), one or more double-opt-in leads
 * (`marketing_leads`, one row per signup form), and a legacy imported contact
 * (`imported_contacts`). An unsubscribe must cover all three, so it:
 *   1. adds the address to `email_suppressions` (the authority every
 *      marketing send checks),
 *   2. flips the per-table flags too (users.marketing_consent → false,
 *      marketing_leads.status → 'unsubscribed'), so older code paths and the
 *      Brevo sync, which filter on those flags, honour it with no change,
 *   3. blacklists the address in Brevo if it's configured,
 *   4. writes an append-only `marketing_unsubscribed` event (who, how, when).
 *
 * Transactional mail (sign-in links, receipts, certificates) never consults
 * this. People can't opt out of their own account mail.
 *
 * Until migration 0031 is applied the table doesn't exist. Every function
 * here degrades instead of failing: steps 2–4 still happen, and
 * `loadSuppressions` falls back to deriving the set from the events log, so an
 * unsubscribe recorded before the migration is still honoured.
 */
import { and, desc, eq, inArray, isNotNull, isNull } from "drizzle-orm";
import type { Db } from "@/db/client";
import { schema } from "@/db/client";
import { isMissingTable } from "@/lib/db-errors";
import { logEvent } from "@/lib/events";
import { nowIso } from "@/lib/time";
import { setBrevoBlacklisted } from "@/lib/brevo";

const UNSUB = "marketing_unsubscribed";
const RESUB = "marketing_resubscribed";

export const norm = (e: string) => e.trim().toLowerCase();

/** Every suppressed address. One query; callers check membership in memory. */
export async function loadSuppressions(db: Db): Promise<Set<string>> {
  try {
    const rows = await db.select({ email: schema.emailSuppressions.email }).from(schema.emailSuppressions).all();
    return new Set(rows.map((r) => norm(r.email)));
  } catch (e) {
    if (!isMissingTable(e)) throw e;
    return suppressionsFromEvents(db);
  }
}

/** Pre-migration fallback: replay unsubscribe/resubscribe events in order. */
async function suppressionsFromEvents(db: Db): Promise<Set<string>> {
  const rows = await db
    .select({ type: schema.events.type, payload: schema.events.payload })
    .from(schema.events)
    .where(inArray(schema.events.type, [UNSUB, RESUB]))
    .orderBy(schema.events.occurredAt)
    .all();
  const out = new Set<string>();
  for (const r of rows) {
    const email = (r.payload as { email?: string } | null)?.email;
    if (!email) continue;
    if (r.type === UNSUB) out.add(norm(email));
    else out.delete(norm(email));
  }
  return out;
}

export async function isSuppressed(db: Db, email: string): Promise<boolean> {
  return (await loadSuppressions(db)).has(norm(email));
}

export interface PrefChange {
  /** How it happened: "link" (unsubscribe page), "admin", "double_opt_in"… */
  source: string;
  adminUserId?: string | null;
  adminEmail?: string | null;
  reason?: string | null;
}

async function accountIdFor(db: Db, email: string): Promise<string | null> {
  const u = await db.select({ id: schema.users.id }).from(schema.users).where(eq(schema.users.email, email)).get();
  return u?.id ?? null;
}

/** Opt an address out of ALL marketing email. Idempotent. */
export async function unsubscribeEmail(env: CloudflareEnv, db: Db, rawEmail: string, change: PrefChange): Promise<void> {
  const email = norm(rawEmail);
  try {
    await db
      .insert(schema.emailSuppressions)
      .values({ email, reason: change.source === "admin" ? "admin" : "unsubscribed", source: change.source })
      .onConflictDoNothing();
  } catch (e) {
    if (!isMissingTable(e)) throw e;
    console.warn("[email-prefs] email_suppressions missing; recorded in events only — run db:migrate:remote");
  }
  await db
    .update(schema.users)
    .set({ marketingConsent: false, updatedAt: nowIso() })
    .where(eq(schema.users.email, email));
  await db
    .update(schema.marketingLeads)
    .set({ status: "unsubscribed" })
    .where(eq(schema.marketingLeads.email, email));

  await logEvent(db, {
    userId: await accountIdFor(db, email),
    type: UNSUB,
    payload: { email, source: change.source, adminUserId: change.adminUserId ?? null, adminEmail: change.adminEmail ?? null, reason: change.reason ?? null },
  });

  try {
    await setBrevoBlacklisted(env, email, true);
  } catch (e) {
    console.error("[email-prefs] Brevo blacklist failed (opt-out still recorded here)", e);
  }
}

/**
 * Lift an opt-out. Only on fresh consent from the PERSON: a confirmed
 * double-opt-in (`source: "double_opt_in"`), choosing a renewal month
 * (`"renewal_setup"`), the person's own dashboard switch
 * (`"account_settings"`), or an admin acting on the person's own request
 * (`"admin"`, reason required by the caller). The last two are a statement
 * about ALL their marketing email, so they also restore the account's consent
 * flag and any previously-confirmed leads.
 */
export async function resubscribeEmail(env: CloudflareEnv, db: Db, rawEmail: string, change: PrefChange): Promise<void> {
  const email = norm(rawEmail);
  try {
    await db.delete(schema.emailSuppressions).where(eq(schema.emailSuppressions.email, email));
  } catch (e) {
    if (!isMissingTable(e)) throw e;
  }
  if (change.source === "admin" || change.source === "account_settings") {
    await db
      .update(schema.users)
      .set({ marketingConsent: true, marketingConsentAt: nowIso(), updatedAt: nowIso() })
      .where(eq(schema.users.email, email));
    // Leads that were confirmed before the opt-out go back to confirmed; a lead
    // that never confirmed stays out (it never had double opt-in).
    await db
      .update(schema.marketingLeads)
      .set({ status: "confirmed" })
      .where(and(eq(schema.marketingLeads.email, email), eq(schema.marketingLeads.status, "unsubscribed"), isNotNull(schema.marketingLeads.confirmedAt)));
    await db
      .update(schema.marketingLeads)
      .set({ status: "pending" })
      .where(and(eq(schema.marketingLeads.email, email), eq(schema.marketingLeads.status, "unsubscribed"), isNull(schema.marketingLeads.confirmedAt)));
  }
  await logEvent(db, {
    userId: await accountIdFor(db, email),
    type: RESUB,
    payload: { email, source: change.source, adminUserId: change.adminUserId ?? null, adminEmail: change.adminEmail ?? null, reason: change.reason ?? null },
  });
  try {
    await setBrevoBlacklisted(env, email, false);
  } catch (e) {
    console.error("[email-prefs] Brevo un-blacklist failed", e);
  }
}

/** Most recent opt-out/opt-in event for an address, for display. */
export async function lastPrefEvent(db: Db, email: string) {
  const rows = await db
    .select({ type: schema.events.type, occurredAt: schema.events.occurredAt, payload: schema.events.payload })
    .from(schema.events)
    .where(inArray(schema.events.type, [UNSUB, RESUB]))
    .orderBy(desc(schema.events.occurredAt))
    .all();
  return rows.find((r) => norm((r.payload as { email?: string } | null)?.email ?? "") === norm(email)) ?? null;
}
