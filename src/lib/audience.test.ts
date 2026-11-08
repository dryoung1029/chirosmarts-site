import { describe, it, expect, vi } from "vitest";
import { makeTestDb } from "@/test/sqlite-db";
import { applyAudienceFilter, deriveStatus, getAudience, parseAudienceFilter } from "./audience";
import { unsubscribeEmail } from "./email-prefs";
import { getContactsForExport, toCsv } from "./contacts";

const env = { SITE_URL: "https://site.test" } as unknown as CloudflareEnv;
vi.spyOn(console, "warn").mockImplementation(() => {});

describe("deriveStatus", () => {
  const base = { suppressed: false, accountConsent: null, leadStatuses: [] as string[], legacy: false };
  it("opt-out beats everything", () => {
    expect(deriveStatus({ ...base, suppressed: true, accountConsent: true, leadStatuses: ["confirmed"] })).toBe("unsubscribed");
  });
  it("account consent or any confirmed lead = subscribed", () => {
    expect(deriveStatus({ ...base, accountConsent: true })).toBe("subscribed");
    expect(deriveStatus({ ...base, accountConsent: false, leadStatuses: ["pending", "confirmed"] })).toBe("subscribed");
  });
  it("only pending leads = awaiting confirmation", () => {
    expect(deriveStatus({ ...base, leadStatuses: ["pending"], legacy: true })).toBe("pending");
  });
  it("legacy-only vs not opted in", () => {
    expect(deriveStatus({ ...base, legacy: true })).toBe("legacy");
    expect(deriveStatus({ ...base, accountConsent: false, legacy: true })).toBe("not_opted_in");
  });
});

describe("getAudience", () => {
  it("merges one row per address across all three sources", async () => {
    const { db, raw } = makeTestDb();
    raw.prepare("insert into users(id,email,legal_name,marketing_consent) values ('u1','ann@x.test','Ann Lee',1)").run();
    raw.prepare("insert into marketing_leads(id,email,source,status,tags) values ('l1','ann@x.test','talking_to_pain','pending','[\"talking-to-pain\",\"CE-interest\"]')").run();
    raw.prepare("insert into marketing_leads(id,email,source,status,confirmed_at) values ('l2','bo@x.test','newsletter','confirmed','2026-02-01T00:00:00.000Z')").run();
    raw.prepare("insert into imported_contacts(id,email,first_name,last_name,certified) values ('c1','ANN@x.test','Annie','Lee',1)").run();
    raw.prepare("insert into imported_contacts(id,email,first_name) values ('c2','cy@x.test','Cy')").run();

    const rows = await getAudience(db);
    const by = Object.fromEntries(rows.map((r) => [r.email, r]));
    expect(Object.keys(by).sort()).toEqual(["ann@x.test", "bo@x.test", "cy@x.test"]);
    expect(by["ann@x.test"]).toMatchObject({
      name: "Ann Lee", status: "subscribed", userId: "u1", certified: true,
      sources: ["account", "talking_to_pain", "legacy"], tags: ["talking-to-pain", "CE-interest"],
    });
    expect(by["bo@x.test"].status).toBe("subscribed");
    expect(by["cy@x.test"].status).toBe("legacy");

    // filters
    const ttp = applyAudienceFilter(rows, parseAudienceFilter(new URLSearchParams("source=talking_to_pain")));
    expect(ttp.map((r) => r.email)).toEqual(["ann@x.test"]);
    const noAcct = applyAudienceFilter(rows, parseAudienceFilter(new URLSearchParams("account=no&status=legacy")));
    expect(noAcct.map((r) => r.email)).toEqual(["cy@x.test"]);
  });

  it("shows unsubscribed people as unsubscribed, and keeps them out of the legacy CSV export", async () => {
    const { db, raw } = makeTestDb();
    raw.prepare("insert into imported_contacts(id,email,first_name) values ('c1','cy@x.test','Cy')").run();
    raw.prepare("insert into imported_contacts(id,email,first_name) values ('c2','di@x.test','Di')").run();
    await unsubscribeEmail(env, db, "cy@x.test", { source: "link" });

    const rows = await getAudience(db);
    expect(rows.find((r) => r.email === "cy@x.test")?.status).toBe("unsubscribed");
    expect((await getContactsForExport(db, "all")).map((c) => c.email)).toEqual(["di@x.test"]);
  });

  it("works before migrations 0028–0031 (no lead name/tags, no suppressions table)", async () => {
    const { db, raw } = makeTestDb({ upTo: "0027" });
    raw.prepare("insert into marketing_leads(id,email,source,status) values ('l1','bo@x.test','newsletter','pending')").run();
    const rows = await getAudience(db);
    expect(rows).toMatchObject([{ email: "bo@x.test", status: "pending", tags: [] }]);
  });
});

describe("toCsv", () => {
  it("neutralises spreadsheet formulas from public form input", () => {
    const csv = toCsv([{ key: "n", label: "Name" }], [{ n: '=HYPERLINK("http://evil","x")' }, { n: "Ann" }]);
    expect(csv).toContain(`"'=HYPERLINK(""http://evil"",""x"")"`);
    expect(csv).toContain("\nAnn\n");
  });
});
