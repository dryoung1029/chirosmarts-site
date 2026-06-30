/**
 * Admin: download the full imported contact roster (CSV) — for an individual
 * direct-mail run or to hand to Brevo. Access enforced in middleware.
 */
import type { APIRoute } from "astro";
import { getDb } from "@/db/client";
import { getContactsForExport, toCsv } from "@/lib/contacts";

export const GET: APIRoute = async ({ locals }) => {
  const db = getDb(locals.runtime.env);
  const contacts = await getContactsForExport(db);
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
    ],
    contacts as unknown as Record<string, unknown>[],
  );
  return new Response(csv, {
    headers: {
      "content-type": "text/csv; charset=utf-8",
      "content-disposition": 'attachment; filename="chirosmarts-contacts.csv"',
    },
  });
};
