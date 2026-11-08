/**
 * The unified mailing audience — ONE row per email address, merged from the
 * three places a person can be on our list:
 *
 *   users              an account (marketing_consent = the intake checkbox)
 *   marketing_leads    double-opt-in signups, one row PER FORM (newsletter,
 *                      checklist, renewal checker, Talking to Pain…)
 *   imported_contacts  the legacy WordPress roster
 *
 * …plus `email_suppressions` (opt-outs), which overrides everything.
 * Read-only: nothing here changes data. The status rules live in
 * `deriveStatus` so the Audience page, its CSV export, and the student detail
 * page all agree.
 */
import { eq } from "drizzle-orm";
import type { Db } from "@/db/client";
import { schema } from "@/db/client";
import { isMissingColumn } from "@/lib/db-errors";
import { loadSuppressions, norm } from "@/lib/email-prefs";

export type MailStatus = "subscribed" | "pending" | "unsubscribed" | "legacy" | "not_opted_in";

export const STATUS_LABEL: Record<MailStatus, string> = {
  subscribed: "Subscribed",
  pending: "Awaiting confirmation",
  unsubscribed: "Unsubscribed",
  legacy: "Legacy roster",
  not_opted_in: "Not opted in",
};

export const STATUS_HELP: Record<MailStatus, string> = {
  subscribed: "Consented: ticked the box at intake, or confirmed a signup by email.",
  pending: "Signed up on a form but hasn't clicked the confirmation email yet. Don't market to them.",
  unsubscribed: "Opted out. Never send marketing email.",
  legacy: "On the old WordPress roster only. Hasn't opted in on this site; consent is from the old forms.",
  not_opted_in: "Has an account but unticked marketing at intake, or never confirmed a signup.",
};

export interface AudienceRow {
  email: string;
  name: string;
  status: MailStatus;
  /** Where we know them from: "account", lead sources, "legacy". */
  sources: string[];
  tags: string[];
  userId: string | null;
  accountConsent: boolean | null; // null = no account
  certified: boolean;
  birthMonth: number | null;
  /** When they consented: intake opt-in, else earliest confirmed signup. */
  consentAt: string | null;
  brevoSyncedAt: string | null;
  firstSeenAt: string | null;
}

interface Parts {
  suppressed: boolean;
  accountConsent: boolean | null;
  leadStatuses: string[]; // "pending" | "confirmed" | "unsubscribed"
  legacy: boolean;
}

/** The status rules, in priority order. Pure, so it's unit-tested. */
export function deriveStatus(p: Parts): MailStatus {
  if (p.suppressed) return "unsubscribed";
  if (p.accountConsent === true || p.leadStatuses.includes("confirmed")) return "subscribed";
  if (p.leadStatuses.includes("pending")) return "pending";
  if (p.accountConsent === null && p.leadStatuses.length === 0 && p.legacy) return "legacy";
  return "not_opted_in";
}

type LeadRow = {
  email: string;
  source: string;
  status: string;
  confirmedAt: string | null;
  createdAt: string;
  birthMonth: number | null;
  syncedToBrevoAt: string | null;
  name?: string | null;
  tags?: unknown;
};

async function loadLeads(db: Db, email?: string): Promise<LeadRow[]> {
  const base = {
    email: schema.marketingLeads.email,
    source: schema.marketingLeads.source,
    status: schema.marketingLeads.status,
    confirmedAt: schema.marketingLeads.confirmedAt,
    createdAt: schema.marketingLeads.createdAt,
    birthMonth: schema.marketingLeads.birthMonth,
    syncedToBrevoAt: schema.marketingLeads.syncedToBrevoAt,
  };
  const where = email ? eq(schema.marketingLeads.email, email) : undefined;
  try {
    return await db
      .select({ ...base, name: schema.marketingLeads.name, tags: schema.marketingLeads.tags })
      .from(schema.marketingLeads)
      .where(where)
      .all();
  } catch (e) {
    // name/tags arrive with migrations 0028/0029; show everything else meanwhile.
    if (!isMissingColumn(e)) throw e;
    return await db.select(base).from(schema.marketingLeads).where(where).all();
  }
}

const minIso = (a: string | null, b: string | null) => (!a ? b : !b ? a : a < b ? a : b);
const maxIso = (a: string | null, b: string | null) => (!a ? b : !b ? a : a > b ? a : b);

/** Build the merged audience. `onlyEmail` narrows every query to one address. */
export async function getAudience(db: Db, onlyEmail?: string): Promise<AudienceRow[]> {
  const one = onlyEmail ? norm(onlyEmail) : undefined;
  const suppressed = await loadSuppressions(db);

  const users = await db
    .select({
      id: schema.users.id,
      email: schema.users.email,
      legalName: schema.users.legalName,
      displayName: schema.users.displayName,
      consent: schema.users.marketingConsent,
      consentAt: schema.users.marketingConsentAt,
      birthMonth: schema.users.birthMonth,
      createdAt: schema.users.createdAt,
    })
    .from(schema.users)
    .where(one ? eq(schema.users.email, one) : undefined)
    .all();

  const certifiedUserIds = new Set(
    (
      await db
        .select({ userId: schema.certificates.userId })
        .from(schema.certificates)
        .where(eq(schema.certificates.status, "issued"))
        .all()
    ).map((c) => c.userId),
  );

  const leads = await loadLeads(db, one);

  const legacy = await db
    .select({
      email: schema.importedContacts.email,
      firstName: schema.importedContacts.firstName,
      lastName: schema.importedContacts.lastName,
      certified: schema.importedContacts.certified,
      birthMonth: schema.importedContacts.birthMonth,
      firstSeenAt: schema.importedContacts.firstSeenAt,
    })
    .from(schema.importedContacts)
    .where(one ? eq(schema.importedContacts.email, one) : undefined)
    .all();

  type Acc = AudienceRow & { leadStatuses: string[]; legacy: boolean };
  const byEmail = new Map<string, Acc>();
  const get = (raw: string): Acc => {
    const email = norm(raw);
    let r = byEmail.get(email);
    if (!r) {
      r = {
        email, name: "", status: "not_opted_in", sources: [], tags: [], userId: null,
        accountConsent: null, certified: false, birthMonth: null, consentAt: null,
        brevoSyncedAt: null, firstSeenAt: null, leadStatuses: [], legacy: false,
      };
      byEmail.set(email, r);
    }
    return r;
  };

  for (const u of users) {
    const r = get(u.email);
    r.userId = u.id;
    r.accountConsent = !!u.consent;
    r.name = u.legalName?.trim() || u.displayName || r.name;
    r.sources.push("account");
    r.certified ||= certifiedUserIds.has(u.id);
    r.birthMonth ??= u.birthMonth;
    if (u.consent) r.consentAt = minIso(r.consentAt, u.consentAt);
    r.firstSeenAt = minIso(r.firstSeenAt, u.createdAt);
  }
  for (const l of leads) {
    const r = get(l.email);
    r.leadStatuses.push(l.status);
    if (!r.sources.includes(l.source)) r.sources.push(l.source);
    if (!r.name && l.name) r.name = l.name;
    for (const t of Array.isArray(l.tags) ? (l.tags as string[]) : []) if (!r.tags.includes(t)) r.tags.push(t);
    r.birthMonth ??= l.birthMonth;
    if (l.status === "confirmed" || l.status === "unsubscribed") r.consentAt = minIso(r.consentAt, l.confirmedAt);
    r.brevoSyncedAt = maxIso(r.brevoSyncedAt, l.syncedToBrevoAt);
    r.firstSeenAt = minIso(r.firstSeenAt, l.createdAt);
  }
  for (const c of legacy) {
    const r = get(c.email);
    r.legacy = true;
    r.sources.push("legacy");
    if (!r.name) r.name = [c.firstName, c.lastName].filter(Boolean).join(" ");
    r.certified ||= !!c.certified;
    r.birthMonth ??= c.birthMonth;
    r.firstSeenAt = minIso(r.firstSeenAt, c.firstSeenAt);
  }

  const out: AudienceRow[] = [];
  for (const r of byEmail.values()) {
    r.status = deriveStatus({
      suppressed: suppressed.has(r.email),
      accountConsent: r.accountConsent,
      leadStatuses: r.leadStatuses,
      legacy: r.legacy,
    });
    const { leadStatuses: _l, legacy: _g, ...row } = r;
    out.push(row);
  }
  return out.sort((a, b) => (b.firstSeenAt ?? "").localeCompare(a.firstSeenAt ?? ""));
}

/** Mailing status for one address (student detail page). */
export async function getMailingStatus(db: Db, email: string): Promise<AudienceRow | null> {
  return (await getAudience(db, email))[0] ?? null;
}

// ---------------------------------------------------------------------------
// Filtering, shared by the page and the CSV export so they always match.
// ---------------------------------------------------------------------------
export interface AudienceFilter {
  q: string;
  status: MailStatus | "";
  source: string;
  tag: string;
  account: "" | "yes" | "no";
  certified: "" | "yes" | "no";
}

export function parseAudienceFilter(params: URLSearchParams): AudienceFilter {
  const pick = <T extends string>(k: string, ok: readonly T[]): T | "" => {
    const v = params.get(k) ?? "";
    return (ok as readonly string[]).includes(v) ? (v as T) : "";
  };
  return {
    q: (params.get("q") ?? "").trim().toLowerCase().slice(0, 100),
    status: pick("status", Object.keys(STATUS_LABEL) as MailStatus[]),
    source: (params.get("source") ?? "").slice(0, 40),
    tag: (params.get("tag") ?? "").slice(0, 40),
    account: pick("account", ["yes", "no"] as const),
    certified: pick("certified", ["yes", "no"] as const),
  };
}

export function applyAudienceFilter(rows: AudienceRow[], f: AudienceFilter): AudienceRow[] {
  return rows.filter(
    (r) =>
      (!f.q || r.email.includes(f.q) || r.name.toLowerCase().includes(f.q)) &&
      (!f.status || r.status === f.status) &&
      (!f.source || r.sources.includes(f.source)) &&
      (!f.tag || r.tags.includes(f.tag)) &&
      (!f.account || (f.account === "yes") === (r.userId !== null)) &&
      (!f.certified || (f.certified === "yes") === r.certified),
  );
}

/** The filter as a query string (for links, paging, and export). */
export function audienceQuery(f: AudienceFilter, extra: Record<string, string> = {}): string {
  const p = new URLSearchParams();
  for (const [k, v] of Object.entries({ ...f, ...extra })) if (v) p.set(k, String(v));
  const s = p.toString();
  return s ? `?${s}` : "";
}
