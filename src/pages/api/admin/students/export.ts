/**
 * Admin: CSV of the Students view, with the SAME filters/sort as the page
 * (access enforced in middleware). One row per student; courses are listed
 * as "Title (status, NN%)" in a single cell.
 */
import type { APIRoute } from "astro";
import { getDb } from "@/db/client";
import { applyRosterFilter, buildRoster, FLAG_LABEL, parseRosterFilter, VIEWS } from "@/lib/admin/roster";
import { STATUS_LABEL } from "@/lib/audience";
import { toCsv } from "@/lib/contacts";
import { formatPacific } from "@/lib/time";

export const GET: APIRoute = async ({ locals, url }) => {
  const db = getDb(locals.runtime.env);
  const now = new Date();
  const f = parseRosterFilter(url.searchParams);
  const rows = applyRosterFilter(await buildRoster(db, { now }), f, now);
  const date = (iso: string | null) => (iso ? formatPacific(iso, { dateStyle: "medium" }) : "");
  const csv = toCsv(
    [
      { key: "name", label: "Name" },
      { key: "email", label: "Email" },
      { key: "role", label: "Account type" },
      { key: "clinic", label: "CA at clinic" },
      { key: "courses", label: "Courses" },
      { key: "flags", label: "Flags" },
      { key: "certs", label: "Certificates" },
      { key: "mailing", label: "Mailing list" },
      { key: "lastActive", label: "Last active" },
      { key: "lastLogin", label: "Last sign-in" },
      { key: "joined", label: "Joined" },
    ],
    rows.map((r) => ({
      name: r.name,
      email: r.email,
      role: r.role,
      clinic: r.clinicName ?? "",
      courses: r.courses
        .map((c) => `${c.title} (${c.status}${c.status === "active" && c.progress != null ? `, ${Math.round(c.progress * 100)}%` : ""})`)
        .join("; "),
      flags: r.flags.map((fl) => FLAG_LABEL[fl]).join("; "),
      certs: r.certs,
      mailing: r.mailing ? STATUS_LABEL[r.mailing] : "",
      lastActive: date(r.lastActivityAt),
      lastLogin: date(r.lastLoginAt),
      joined: date(r.createdAt),
    })),
  );
  const stamp = now.toISOString().slice(0, 10);
  const view = VIEWS[f.view].toLowerCase().replace(/[^a-z]+/g, "-");
  return new Response(csv, {
    headers: {
      "content-type": "text/csv; charset=utf-8",
      "content-disposition": `attachment; filename="chirosmarts-students-${view}-${stamp}.csv"`,
    },
  });
};
