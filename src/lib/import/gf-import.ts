/**
 * Gravity Forms CSV import — parse + classify legacy export files.
 *
 * Pure (no DB): turns a GF "Export Entries" CSV into normalized records and a
 * summary, so the admin importer can preview before writing. Column positions
 * vary by form, so we locate fields by header substring rather than index.
 */

export interface GfRecord {
  email: string;
  firstName: string;
  lastName: string;
  clinic: string;
  phone: string;
  addressStreet: string;
  addressCity: string;
  addressState: string;
  addressZip: string;
  entryId: string;
  transactionId: string;
  paymentStatus: string; // raw, e.g. "Paid" | "Processing" | "Refunded" | ""
  paymentAmountCents: number | null;
  listedPriceCents: number | null;
  paymentDateIso: string | null;
  entryDateIso: string | null;
}

export interface GfSummary {
  total: number;
  paid: number;
  refunded: number;
  processing: number;
  otherStatus: number;
  grossCents: number;
  refundCents: number;
  netCents: number;
  uniqueEmails: number;
  withClinic: number;
  withAddress: number;
  byYear: { year: string; paid: number; grossCents: number }[];
}

/** Minimal RFC-4180-ish CSV parser (handles quotes, commas, newlines, BOM). */
export function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let field = "";
  let row: string[] = [];
  let i = 0;
  let inQuotes = false;
  const s = text.charCodeAt(0) === 0xfeff ? text.slice(1) : text; // strip BOM
  while (i < s.length) {
    const c = s[i];
    if (inQuotes) {
      if (c === '"') {
        if (s[i + 1] === '"') {
          field += '"';
          i += 2;
          continue;
        }
        inQuotes = false;
        i++;
        continue;
      }
      field += c;
      i++;
      continue;
    }
    if (c === '"') {
      inQuotes = true;
      i++;
      continue;
    }
    if (c === ",") {
      row.push(field);
      field = "";
      i++;
      continue;
    }
    if (c === "\n" || c === "\r") {
      // consume \r\n as one break
      if (c === "\r" && s[i + 1] === "\n") i++;
      row.push(field);
      rows.push(row);
      row = [];
      field = "";
      i++;
      continue;
    }
    field += c;
    i++;
  }
  // last field/row if no trailing newline
  if (field.length > 0 || row.length > 0) {
    row.push(field);
    rows.push(row);
  }
  return rows;
}

const moneyToCents = (v: string): number | null => {
  const s = (v || "").replace(/[$,\s]/g, "");
  if (!s) return null;
  const n = Number(s);
  return Number.isFinite(n) ? Math.round(n * 100) : null;
};

/** "YYYY-MM-DD HH:MM:SS" → "YYYY-MM-DDTHH:MM:SSZ" (best-effort). */
const toIso = (v: string): string | null => {
  const m = (v || "").trim().match(/^(\d{4}-\d{2}-\d{2})[ T](\d{2}:\d{2}:\d{2})/);
  if (m) return `${m[1]}T${m[2]}Z`;
  const d = (v || "").trim().match(/^(\d{4}-\d{2}-\d{2})$/);
  return d ? `${d[1]}T12:00:00Z` : null;
};

/** Find the first header index whose lowercased text includes all needles. */
function findCol(headers: string[], ...needles: string[]): number {
  const lower = headers.map((h) => h.toLowerCase());
  return lower.findIndex((h) => needles.every((n) => h.includes(n.toLowerCase())));
}

export interface ParseResult {
  records: GfRecord[];
  warnings: string[];
  detected: Record<string, boolean>;
}

export function parseGravityCsv(text: string): ParseResult {
  const rows = parseCsv(text);
  if (rows.length < 2) return { records: [], warnings: ["No data rows found."], detected: {} };
  const headers = rows[0];

  const col = {
    email: findCol(headers, "email"),
    first: findCol(headers, "name (first)"),
    last: findCol(headers, "name (last)"),
    clinic: findCol(headers, "clinic"),
    phone: headers.findIndex((h) => h.toLowerCase().trim() === "phone"),
    street: findCol(headers, "street address"),
    city: findCol(headers, "(city)"),
    state: findCol(headers, "state /"),
    zip: findCol(headers, "zip"),
    entryId: findCol(headers, "entry id"),
    entryDate: findCol(headers, "entry date"),
    txn: findCol(headers, "transaction id"),
    payAmount: findCol(headers, "payment amount"),
    payDate: findCol(headers, "payment date"),
    payStatus: findCol(headers, "payment status"),
    price: findCol(headers, "(price)"),
  };

  const warnings: string[] = [];
  if (col.email < 0) warnings.push("No Email column found — contacts can't be deduped.");
  if (col.payAmount < 0 && col.price < 0)
    warnings.push("No Payment Amount / Price column — revenue rows can't be detected.");

  const at = (r: string[], i: number) => (i >= 0 ? (r[i] ?? "").trim() : "");
  const records: GfRecord[] = [];
  for (let ri = 1; ri < rows.length; ri++) {
    const r = rows[ri];
    if (r.length === 1 && r[0] === "") continue; // blank line
    records.push({
      email: at(r, col.email).toLowerCase(),
      firstName: at(r, col.first),
      lastName: at(r, col.last),
      clinic: at(r, col.clinic),
      phone: at(r, col.phone),
      addressStreet: at(r, col.street),
      addressCity: at(r, col.city),
      addressState: at(r, col.state),
      addressZip: at(r, col.zip),
      entryId: at(r, col.entryId),
      transactionId: at(r, col.txn),
      paymentStatus: at(r, col.payStatus),
      paymentAmountCents: moneyToCents(at(r, col.payAmount)),
      listedPriceCents: moneyToCents(at(r, col.price)),
      paymentDateIso: toIso(at(r, col.payDate)),
      entryDateIso: toIso(at(r, col.entryDate)),
    });
  }

  const detected = Object.fromEntries(Object.entries(col).map(([k, v]) => [k, v >= 0]));
  return { records, warnings, detected };
}

export const isPaid = (r: GfRecord) =>
  r.paymentStatus.toLowerCase() === "paid" && (r.paymentAmountCents ?? 0) > 0;
export const isRefunded = (r: GfRecord) => r.paymentStatus.toLowerCase() === "refunded";

export function summarize(records: GfRecord[]): GfSummary {
  let paid = 0,
    refunded = 0,
    processing = 0,
    otherStatus = 0,
    grossCents = 0,
    refundCents = 0,
    withClinic = 0,
    withAddress = 0;
  const emails = new Set<string>();
  const yearMap = new Map<string, { paid: number; grossCents: number }>();
  for (const r of records) {
    if (r.email) emails.add(r.email);
    if (r.clinic) withClinic++;
    if (r.addressStreet) withAddress++;
    const st = r.paymentStatus.toLowerCase();
    if (isPaid(r)) {
      paid++;
      grossCents += r.paymentAmountCents ?? 0;
      const yr = (r.paymentDateIso ?? r.entryDateIso ?? "????").slice(0, 4);
      const y = yearMap.get(yr) ?? { paid: 0, grossCents: 0 };
      y.paid++;
      y.grossCents += r.paymentAmountCents ?? 0;
      yearMap.set(yr, y);
    } else if (st === "refunded") {
      refunded++;
      refundCents += r.paymentAmountCents ?? 0;
    } else if (st === "processing") processing++;
    else otherStatus++;
  }
  const byYear = [...yearMap.entries()]
    .map(([year, v]) => ({ year, ...v }))
    .sort((a, b) => a.year.localeCompare(b.year));
  return {
    total: records.length,
    paid,
    refunded,
    processing,
    otherStatus,
    grossCents,
    refundCents,
    netCents: grossCents - refundCents,
    uniqueEmails: emails.size,
    withClinic,
    withAddress,
    byYear,
  };
}
