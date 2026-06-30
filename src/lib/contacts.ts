/**
 * Imported-contacts queries for the marketing roster + clinic postcard mailer.
 * The legacy forms captured each CONTACT's address and the free-text name of the
 * clinic they work at (no clinic address). So for a clinic mailing we use the
 * most common address among that clinic's contacts as the best-guess location,
 * and surface the CA count so multi-CA clinics (the bulk-seat targets) sort top.
 */
import { desc } from "drizzle-orm";
import type { Db } from "@/db/client";
import { schema } from "@/db/client";

export interface ContactStats {
  total: number;
  buyers: number;
  certified: number;
  withClinic: number;
  uniqueClinics: number;
  withAddress: number;
  oregon: number;
}

export async function getContactStats(db: Db): Promise<ContactStats> {
  const rows = await db
    .select({
      clinic: schema.importedContacts.clinic,
      everBought: schema.importedContacts.everBought,
      certified: schema.importedContacts.certified,
      street: schema.importedContacts.addressStreet,
      state: schema.importedContacts.addressState,
    })
    .from(schema.importedContacts)
    .all();
  const clinics = new Set<string>();
  let buyers = 0,
    certified = 0,
    withClinic = 0,
    withAddress = 0,
    oregon = 0;
  for (const r of rows) {
    if (r.everBought) buyers++;
    if (r.certified) certified++;
    if (r.clinic && r.clinic.trim()) {
      withClinic++;
      clinics.add(normalizeClinic(r.clinic));
    }
    if (r.street && r.street.trim()) withAddress++;
    const st = (r.state ?? "").trim().toLowerCase();
    if (st === "or" || st === "oregon") oregon++;
  }
  return { total: rows.length, buyers, certified, withClinic, uniqueClinics: clinics.size, withAddress, oregon };
}

const normalizeClinic = (s: string) =>
  s.toLowerCase().replace(/[^a-z0-9 ]+/g, " ").replace(/\s+/g, " ").trim();

const mode = <T>(items: T[]): T | null => {
  const counts = new Map<string, { v: T; n: number }>();
  for (const it of items) {
    const k = JSON.stringify(it);
    const c = counts.get(k) ?? { v: it, n: 0 };
    c.n++;
    counts.set(k, c);
  }
  let best: { v: T; n: number } | null = null;
  for (const c of counts.values()) if (!best || c.n > best.n) best = c;
  return best?.v ?? null;
};

export interface ClinicRow {
  clinic: string;
  street: string;
  city: string;
  state: string;
  zip: string;
  phone: string;
  caCount: number;
  buyerCount: number;
}

/** One row per clinic with a best-guess mailing address, busiest first. */
export async function getClinicsForExport(db: Db): Promise<ClinicRow[]> {
  const rows = await db.select().from(schema.importedContacts).all();
  const groups = new Map<string, typeof rows>();
  for (const r of rows) {
    if (!r.clinic || !r.clinic.trim()) continue;
    const key = normalizeClinic(r.clinic);
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key)!.push(r);
  }
  const out: ClinicRow[] = [];
  for (const members of groups.values()) {
    const display = mode(members.map((m) => (m.clinic ?? "").trim())) ?? "";
    const addressed = members.filter((m) => m.addressStreet && m.addressStreet.trim());
    const addr = mode(
      addressed.map((m) => ({
        street: (m.addressStreet ?? "").trim(),
        city: (m.addressCity ?? "").trim(),
        state: (m.addressState ?? "").trim(),
        zip: (m.addressZip ?? "").trim(),
      })),
    ) ?? { street: "", city: "", state: "", zip: "" };
    const phone = mode(members.map((m) => (m.phone ?? "").trim()).filter(Boolean)) ?? "";
    out.push({
      clinic: display,
      ...addr,
      phone,
      caCount: members.length,
      buyerCount: members.filter((m) => m.everBought).length,
    });
  }
  return out.sort((a, b) => b.caCount - a.caCount || a.clinic.localeCompare(b.clinic));
}

export interface ContactRow {
  email: string;
  firstName: string;
  lastName: string;
  clinic: string;
  phone: string;
  street: string;
  city: string;
  state: string;
  zip: string;
  everBought: boolean;
  firstSeenAt: string;
}

/** Full roster for an individual-mail / list export. */
export async function getContactsForExport(db: Db): Promise<ContactRow[]> {
  const rows = await db
    .select()
    .from(schema.importedContacts)
    .orderBy(desc(schema.importedContacts.everBought))
    .all();
  return rows.map((r) => ({
    email: r.email,
    firstName: r.firstName ?? "",
    lastName: r.lastName ?? "",
    clinic: r.clinic ?? "",
    phone: r.phone ?? "",
    street: r.addressStreet ?? "",
    city: r.addressCity ?? "",
    state: r.addressState ?? "",
    zip: r.addressZip ?? "",
    everBought: r.everBought,
    firstSeenAt: r.firstSeenAt ?? "",
  }));
}

/** Build a CSV string from a header list and row objects. */
export function toCsv(headers: { key: string; label: string }[], rows: Record<string, unknown>[]): string {
  const esc = (v: unknown) => {
    const s = v == null ? "" : String(v);
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const head = headers.map((h) => esc(h.label)).join(",");
  const body = rows.map((r) => headers.map((h) => esc(r[h.key])).join(",")).join("\n");
  return `﻿${head}\n${body}\n`; // BOM for Excel
}
