/**
 * Marketing-lead capture with DOUBLE OPT-IN. `captureLead` upserts a `pending`
 * lead and emails a confirmation link; `confirmLead` flips it to `confirmed`.
 * Only confirmed leads are eligible for Brevo sync. Transactional mail goes
 * through Resend (never Brevo). Nothing here fabricates marketing claims.
 */
import { and, eq } from "drizzle-orm";
import type { Db } from "@/db/client";
import { schema } from "@/db/client";
import { newId, randomToken, sha256Hex } from "@/lib/crypto";
import { nowIso } from "@/lib/time";
import { getSiteUrl } from "@/lib/env";
import { sendEmail } from "@/lib/email/resend";
import { logEvent } from "@/lib/events";

export type LeadSource = "renewal_checker" | "checklist_pdf" | "other";

export function normalizeEmail(e: string): string {
  return e.trim().toLowerCase();
}
export function isValidEmail(e: string): boolean {
  return /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(e);
}

function emailBody(source: LeadSource, confirmUrl: string, site: string) {
  const isChecklist = source === "checklist_pdf";
  const subject = isChecklist
    ? "Confirm your email to get the Oregon CA certification checklist"
    : "Confirm your ChiroSmarts renewal reminder";
  const lead = isChecklist
    ? "Thanks for requesting the Oregon CA certification checklist."
    : "Thanks — we'll remind you before your Oregon CA renewal deadline.";
  const cta = isChecklist ? "Confirm & get the checklist" : "Confirm my email";
  // Decorative renewal-reminder illustration (09), hosted as an absolute PNG so it
  // renders in every email client. Only the renewal flow has a mapped image.
  const hero = isChecklist
    ? ""
    : `<img src="${site}/email/renewal.png" alt="" width="320" style="display:block;max-width:320px;height:auto;margin:0 0 12px">`;
  const text = `${lead}\n\nPlease confirm your email to continue:\n${confirmUrl}\n\nIf you didn't request this, you can ignore this message.`;
  const html =
    hero +
    `<p>${lead}</p>` +
    `<p>Please confirm your email to continue:</p>` +
    `<p><a href="${confirmUrl}">${cta}</a></p>` +
    `<p style="color:#666;font-size:13px">If you didn't request this, you can ignore this message.</p>`;
  return { subject, text, html };
}

export interface CaptureInput {
  email: string;
  source: LeadSource;
  birthMonth?: number | null;
}

export async function captureLead(
  env: CloudflareEnv,
  db: Db,
  input: CaptureInput,
): Promise<{ ok: boolean; alreadyConfirmed?: boolean; message: string }> {
  const email = normalizeEmail(input.email);
  if (!isValidEmail(email)) {
    return { ok: false, message: "Please enter a valid email address." };
  }
  const source = input.source;
  const birthMonth =
    Number.isInteger(input.birthMonth) &&
    (input.birthMonth as number) >= 1 &&
    (input.birthMonth as number) <= 12
      ? (input.birthMonth as number)
      : null;

  const existing = await db
    .select()
    .from(schema.marketingLeads)
    .where(
      and(
        eq(schema.marketingLeads.email, email),
        eq(schema.marketingLeads.source, source),
      ),
    )
    .get();

  if (existing && existing.status === "confirmed") {
    return {
      ok: true,
      alreadyConfirmed: true,
      message: "You're already confirmed — thanks!",
    };
  }

  const token = randomToken();
  const confirmTokenHash = await sha256Hex(token);

  if (existing) {
    await db
      .update(schema.marketingLeads)
      .set({ status: "pending", confirmTokenHash, consentAt: nowIso(), birthMonth })
      .where(eq(schema.marketingLeads.id, existing.id));
  } else {
    await db.insert(schema.marketingLeads).values({
      id: newId("lead"),
      email,
      source,
      birthMonth,
      status: "pending",
      confirmTokenHash,
    });
  }

  const site = getSiteUrl(env).replace(/\/$/, "");
  const confirmUrl = `${site}/leads/confirm?token=${token}`;
  const { subject, text, html } = emailBody(source, confirmUrl, site);
  await sendEmail(env, { to: email, subject, html, text });

  await logEvent(db, {
    type: "lead_captured",
    payload: { source, hasBirthMonth: birthMonth != null },
  });

  return {
    ok: true,
    message: "Almost done — check your email and click the confirmation link.",
  };
}

/** Confirm a lead by its raw token. Returns the confirmed lead or null. */
export async function confirmLead(db: Db, token: string) {
  if (!token) return null;
  const hash = await sha256Hex(token);
  const lead = await db
    .select()
    .from(schema.marketingLeads)
    .where(eq(schema.marketingLeads.confirmTokenHash, hash))
    .get();
  if (!lead) return null;

  if (lead.status !== "confirmed") {
    await db
      .update(schema.marketingLeads)
      .set({ status: "confirmed", confirmedAt: nowIso(), confirmTokenHash: null })
      .where(eq(schema.marketingLeads.id, lead.id));
    await logEvent(db, {
      type: "lead_confirmed",
      payload: { source: lead.source },
    });
  }
  return { ...lead, status: "confirmed" as const };
}
