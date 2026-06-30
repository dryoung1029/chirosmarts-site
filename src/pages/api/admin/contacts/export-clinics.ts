/**
 * Admin: download the clinic list for the postcard mailer — one row per clinic,
 * best-guess mailing address, CA count (busiest clinics first). Access enforced
 * in middleware.
 */
import type { APIRoute } from "astro";
import { getDb } from "@/db/client";
import { getClinicsForExport, toCsv } from "@/lib/contacts";

export const GET: APIRoute = async ({ locals }) => {
  const db = getDb(locals.runtime.env);
  const clinics = await getClinicsForExport(db);
  const csv = toCsv(
    [
      { key: "clinic", label: "Clinic" },
      { key: "street", label: "Street" },
      { key: "city", label: "City" },
      { key: "state", label: "State" },
      { key: "zip", label: "ZIP" },
      { key: "phone", label: "Phone" },
      { key: "caCount", label: "CAs on file" },
      { key: "buyerCount", label: "Past buyers" },
    ],
    clinics as unknown as Record<string, unknown>[],
  );
  return new Response(csv, {
    headers: {
      "content-type": "text/csv; charset=utf-8",
      "content-disposition": 'attachment; filename="chirosmarts-clinics-postcards.csv"',
    },
  });
};
