/**
 * WP Courseware "gradebook" CSV import — parse + classify completion data.
 * Different shape from the Gravity Forms exports: per-student rows with a
 * "Course Completion Date" and "Course Progress". We use it to mark certified
 * completers (and their completion date) on the contact roster.
 */
import { parseCsv } from "@/lib/import/gf-import";

export interface GradebookRecord {
  email: string;
  name: string;
  progressPct: number;
  completionDateIso: string | null;
  completed: boolean;
}

export interface GradebookSummary {
  total: number;
  completed: number;
  uniqueEmails: number;
  byYear: { year: string; completed: number }[];
}

const MONTHS: Record<string, string> = {
  january: "01", february: "02", march: "03", april: "04", may: "05", june: "06",
  july: "07", august: "08", september: "09", october: "10", november: "11", december: "12",
};

/** "July 10, 2015" → "2015-07-10T12:00:00Z" (best-effort). */
function parseDate(v: string): string | null {
  const s = (v || "").trim();
  if (!s || s.toUpperCase() === "N/A") return null;
  const m = s.match(/^([A-Za-z]+)\s+(\d{1,2}),\s*(\d{4})$/);
  if (m) {
    const mm = MONTHS[m[1].toLowerCase()];
    if (mm) return `${m[3]}-${mm}-${m[2].padStart(2, "0")}T12:00:00Z`;
  }
  const iso = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
  return iso ? `${iso[1]}-${iso[2]}-${iso[3]}T12:00:00Z` : null;
}

function findCol(headers: string[], ...needles: string[]): number {
  const lower = headers.map((h) => h.toLowerCase());
  return lower.findIndex((h) => needles.every((n) => h.includes(n.toLowerCase())));
}

/** Heuristic: is this a WP Courseware gradebook export (vs a Gravity Forms one)? */
export function isGradebookCsv(text: string): boolean {
  const firstLine = (text.charCodeAt(0) === 0xfeff ? text.slice(1) : text).split(/\r?\n/, 1)[0].toLowerCase();
  return firstLine.includes("course completion date") || firstLine.includes("course progress");
}

export function parseGradebookCsv(text: string): { records: GradebookRecord[] } {
  const rows = parseCsv(text);
  if (rows.length < 2) return { records: [] };
  const headers = rows[0];
  const col = {
    email: findCol(headers, "email"),
    name: findCol(headers, "name"),
    progress: findCol(headers, "course progress"),
    completion: findCol(headers, "course completion date"),
  };
  const at = (r: string[], i: number) => (i >= 0 ? (r[i] ?? "").trim() : "");
  const records: GradebookRecord[] = [];
  for (let i = 1; i < rows.length; i++) {
    const r = rows[i];
    if (r.length === 1 && r[0] === "") continue;
    const completionDateIso = parseDate(at(r, col.completion));
    const pct = parseInt(at(r, col.progress).replace("%", ""), 10);
    records.push({
      email: at(r, col.email).toLowerCase(),
      name: at(r, col.name),
      progressPct: Number.isFinite(pct) ? pct : 0,
      completionDateIso,
      completed: completionDateIso != null,
    });
  }
  return { records };
}

export function summarizeGradebook(records: GradebookRecord[]): GradebookSummary {
  const emails = new Set<string>();
  const yearMap = new Map<string, number>();
  let completed = 0;
  for (const r of records) {
    if (r.email) emails.add(r.email);
    if (r.completed) {
      completed++;
      const yr = (r.completionDateIso ?? "????").slice(0, 4);
      yearMap.set(yr, (yearMap.get(yr) ?? 0) + 1);
    }
  }
  const byYear = [...yearMap.entries()]
    .map(([year, c]) => ({ year, completed: c }))
    .sort((a, b) => a.year.localeCompare(b.year));
  return { total: records.length, completed, uniqueEmails: emails.size, byYear };
}
