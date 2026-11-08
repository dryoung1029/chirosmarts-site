/**
 * Admin: CSV of the Audience view, with the SAME filters as the page
 * (access enforced in middleware).
 *
 * Safety default: unsubscribed addresses are left out unless you explicitly
 * filter to status=unsubscribed (e.g. for a records request), because this
 * file is the kind that gets imported into a mailer. Every row carries the
 * person's own unsubscribe URL for mail-merge footers.
 */
import type { APIRoute } from "astro";
import { getDb } from "@/db/client";
import { applyAudienceFilter, getAudience, parseAudienceFilter, STATUS_LABEL } from "@/lib/audience";
import { toCsv } from "@/lib/contacts";
import { getSiteUrl } from "@/lib/env";
import { unsubscribeUrl } from "@/lib/contact-token";
import { formatPacific } from "@/lib/time";

export const GET: APIRoute = async ({ locals, url }) => {
  const env = locals.runtime.env;
  const db = getDb(env);
  const site = getSiteUrl(env);
  const f = parseAudienceFilter(url.searchParams);
  let rows = applyAudienceFilter(await getAudience(db), f);
  if (f.status !== "unsubscribed") rows = rows.filter((r) => r.status !== "unsubscribed");

  const out = await Promise.all(
    rows.map(async (r) => ({
      email: r.email,
      name: r.name,
      status: STATUS_LABEL[r.status],
      sources: r.sources.join("; "),
      tags: r.tags.join("; "),
      account: r.userId ? "yes" : "no",
      certified: r.certified ? "yes" : "no",
      birthMonth: r.birthMonth ?? "",
      consentAt: r.consentAt ? formatPacific(r.consentAt, { dateStyle: "medium" }) : "",
      unsubscribeUrl: await unsubscribeUrl(env, site, r.email),
    })),
  );
  const csv = toCsv(
    [
      { key: "email", label: "Email" },
      { key: "name", label: "Name" },
      { key: "status", label: "Status" },
      { key: "sources", label: "Sources" },
      { key: "tags", label: "Tags" },
      { key: "account", label: "Has account" },
      { key: "certified", label: "Certified" },
      { key: "birthMonth", label: "Birth month" },
      { key: "consentAt", label: "Consented" },
      { key: "unsubscribeUrl", label: "Unsubscribe URL" },
    ],
    out as unknown as Record<string, unknown>[],
  );
  const stamp = new Date().toISOString().slice(0, 10);
  return new Response(csv, {
    headers: {
      "content-type": "text/csv; charset=utf-8",
      "content-disposition": `attachment; filename="chirosmarts-audience-${f.status || "all"}-${stamp}.csv"`,
    },
  });
};
