/**
 * Admin: download the full imported contact roster (CSV) — for an individual
 * direct-mail run or to hand to Brevo. Access enforced in middleware.
 */
import type { APIRoute } from "astro";
import { getDb } from "@/db/client";
import { getContactsForExport, toCsv } from "@/lib/contacts";
import { getSiteUrl } from "@/lib/env";
import { renewalSetupUrl } from "@/lib/contact-token";

export const GET: APIRoute = async ({ locals }) => {
  const env = locals.runtime.env;
  const db = getDb(env);
  const site = getSiteUrl(env);
  const contacts = await getContactsForExport(db);
  // Add a personalized birth-month-capture link per contact (Brevo merge field).
  const rows = await Promise.all(
    contacts.map(async (c) => ({
      ...c,
      renewalSetupUrl: c.email ? await renewalSetupUrl(env, site, c.email) : "",
    })),
  );
  const csv = toCsv(
    [
      { key: "email", label: "Email" },
      { key: "firstName", label: "First name" },
      { key: "lastName", label: "Last name" },
      { key: "clinic", label: "Clinic" },
      { key: "phone", label: "Phone" },
      { key: "street", label: "Street" },
      { key: "city", label: "City" },
      { key: "state", label: "State" },
      { key: "zip", label: "ZIP" },
      { key: "everBought", label: "Past buyer" },
      { key: "firstSeenAt", label: "First seen" },
      { key: "renewalSetupUrl", label: "Renewal setup URL" },
    ],
    rows as unknown as Record<string, unknown>[],
  );
  return new Response(csv, {
    headers: {
      "content-type": "text/csv; charset=utf-8",
      "content-disposition": 'attachment; filename="chirosmarts-contacts.csv"',
    },
  });
};
