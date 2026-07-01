/**
 * Brevo (marketing email) groundwork — NO campaigns, NO automatic syncing.
 * A manual, admin-triggered job pushes ONLY consented contacts: CONFIRMED
 * marketing leads and users who opted into marketing. Non-consented contacts are
 * never sent. Brevo automations are configured by the owner inside Brevo.
 */
import { and, eq, isNull } from "drizzle-orm";
import type { Db } from "@/db/client";
import { schema } from "@/db/client";
import { nowIso } from "@/lib/time";

export function isBrevoConfigured(env: CloudflareEnv): boolean {
  return !!env.BREVO_API_KEY;
}

/**
 * Brevo list id for a lead source. Newsletter signups and free-checklist
 * downloaders both land on the main newsletter list (they're distinguishable
 * later by their SOURCE contact attribute); other sources use LEADS.
 */
function listIdForSource(env: CloudflareEnv, source: string): number {
  if (source === "newsletter" || source === "checklist_pdf")
    return Number(env.BREVO_LIST_ID_NEWSLETTER) || Number(env.BREVO_LIST_ID_LEADS) || 0;
  return Number(env.BREVO_LIST_ID_LEADS) || 0;
}

/** Push ONE confirmed lead to Brevo immediately (real-time on confirm), then
 *  stamp it synced. Safe to call when Brevo is unconfigured (no-op). */
export async function syncLeadToBrevo(
  env: CloudflareEnv,
  db: Db,
  lead: { id: string; email: string; source: string; birthMonth: number | null },
): Promise<boolean> {
  if (!isBrevoConfigured(env)) return false;
  const listId = listIdForSource(env, lead.source);
  const ok = await upsertContact(env, {
    email: lead.email,
    attributes: { SOURCE: lead.source, BIRTH_MONTH: lead.birthMonth ?? "", ROLE: "lead" },
    listIds: listId ? [listId] : [],
  });
  if (ok) {
    await db
      .update(schema.marketingLeads)
      .set({ syncedToBrevoAt: nowIso() })
      .where(eq(schema.marketingLeads.id, lead.id));
  }
  return ok;
}

/** Push ONE opted-in user to Brevo immediately (real-time on intake opt-in).
 *  Best-effort; safe to call when Brevo is unconfigured (no-op). */
export async function syncUserToBrevo(
  env: CloudflareEnv,
  user: { email: string; role: string; birthMonth: number | null; clinicName?: string | null },
): Promise<boolean> {
  if (!isBrevoConfigured(env)) return false;
  const usersList = Number(env.BREVO_LIST_ID_USERS) || Number(env.BREVO_LIST_ID_LEADS) || 0;
  return upsertContact(env, {
    email: user.email,
    attributes: {
      ROLE: user.role,
      BIRTH_MONTH: user.birthMonth ?? "",
      CLINIC: user.clinicName ?? "",
      SOURCE: "account",
    },
    listIds: usersList ? [usersList] : [],
  });
}

async function upsertContact(
  env: CloudflareEnv,
  contact: {
    email: string;
    attributes: Record<string, unknown>;
    listIds: number[];
  },
): Promise<boolean> {
  const res = await fetch("https://api.brevo.com/v3/contacts", {
    method: "POST",
    headers: {
      "api-key": env.BREVO_API_KEY!,
      "content-type": "application/json",
      accept: "application/json",
    },
    body: JSON.stringify({
      email: contact.email,
      attributes: contact.attributes,
      listIds: contact.listIds.length ? contact.listIds : undefined,
      updateEnabled: true, // upsert
    }),
  });
  // 201 created, 204 updated; treat 2xx as success.
  if (!res.ok) {
    console.error(`[brevo] upsert ${contact.email} failed: ${res.status}`);
    return false;
  }
  return true;
}

export interface SyncResult {
  ok: boolean;
  message: string;
  leadsSynced: number;
  usersSynced: number;
}

export async function syncToBrevo(env: CloudflareEnv, db: Db): Promise<SyncResult> {
  if (!isBrevoConfigured(env)) {
    return { ok: false, message: "Brevo is not configured (BREVO_API_KEY unset).", leadsSynced: 0, usersSynced: 0 };
  }
  const usersList = Number(env.BREVO_LIST_ID_USERS) || 0;

  // CONFIRMED leads not yet synced (or never synced).
  const leads = await db
    .select()
    .from(schema.marketingLeads)
    .where(
      and(
        eq(schema.marketingLeads.status, "confirmed"),
        isNull(schema.marketingLeads.syncedToBrevoAt),
      ),
    )
    .all();

  let leadsSynced = 0;
  for (const lead of leads) {
    const ok = await upsertContact(env, {
      email: lead.email,
      attributes: {
        SOURCE: lead.source,
        BIRTH_MONTH: lead.birthMonth ?? "",
        ROLE: "lead",
      },
      listIds: listIdForSource(env, lead.source) ? [listIdForSource(env, lead.source)] : [],
    });
    if (ok) {
      await db
        .update(schema.marketingLeads)
        .set({ syncedToBrevoAt: nowIso() })
        .where(eq(schema.marketingLeads.id, lead.id));
      leadsSynced++;
    }
  }

  // Users who OPTED IN to marketing.
  const users = await db
    .select()
    .from(schema.users)
    .where(eq(schema.users.marketingConsent, true))
    .all();

  let usersSynced = 0;
  for (const u of users) {
    const ok = await upsertContact(env, {
      email: u.email,
      attributes: {
        ROLE: u.role,
        BIRTH_MONTH: u.birthMonth ?? "",
        SOURCE: "account",
      },
      listIds: usersList ? [usersList] : [],
    });
    if (ok) usersSynced++;
  }

  return {
    ok: true,
    message: `Synced ${leadsSynced} lead(s) and ${usersSynced} opted-in user(s) to Brevo.`,
    leadsSynced,
    usersSynced,
  };
}
