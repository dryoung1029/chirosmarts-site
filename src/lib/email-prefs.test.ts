import { describe, it, expect, vi } from "vitest";
import { makeTestDb } from "@/test/sqlite-db";
import { isSuppressed, loadSuppressions, resubscribeEmail, unsubscribeEmail } from "./email-prefs";
import { runDailyFlows } from "./flows";
import { unsubscribeUrl, verifyUnsubscribeToken, makeContactToken } from "./contact-token";

// No RESEND_API_KEY / BREVO_API_KEY → email is logged, not sent; Brevo is a no-op.
const env = { SITE_URL: "https://site.test", CONTACT_TOKEN_SECRET: "test-secret" } as unknown as CloudflareEnv;
const warn = vi.spyOn(console, "warn").mockImplementation(() => {});

type Raw = ReturnType<typeof makeTestDb>["raw"];
const one = (raw: Raw, q: string, ...p: (string | number)[]) =>
  raw.prepare(q).get(...p) as Record<string, unknown> | undefined;

function seedUser(raw: Raw, id: string, email: string, consent: boolean, birthMonth: number | null = null) {
  raw.prepare(
    "insert into users(id,email,legal_name,role,marketing_consent,birth_month) values (?,?,?,?,?,?)",
  ).run(id, email, "Test Person", "student", consent ? 1 : 0, birthMonth);
}
function seedLead(raw: Raw, id: string, email: string, source: string, status: string, confirmedAt: string | null) {
  raw.prepare(
    "insert into marketing_leads(id,email,source,status,confirmed_at) values (?,?,?,?,?)",
  ).run(id, email, source, status, confirmedAt);
}

describe("unsubscribe / resubscribe", () => {
  it("covers the account, every lead row, and the suppression list", async () => {
    const { db, raw } = makeTestDb();
    seedUser(raw, "u1", "ann@x.test", true);
    seedLead(raw, "l1", "ann@x.test", "newsletter", "confirmed", "2026-01-01T00:00:00.000Z");
    seedLead(raw, "l2", "ann@x.test", "talking_to_pain", "pending", null);

    await unsubscribeEmail(env, db, " Ann@X.test ", { source: "link" });

    expect(await isSuppressed(db, "ann@x.test")).toBe(true);
    expect(one(raw, "select marketing_consent c from users where id='u1'")?.c).toBe(0);
    expect(raw.prepare("select status from marketing_leads order by id").all().map((r) => r.status))
      .toEqual(["unsubscribed", "unsubscribed"]);
    const ev = one(raw, "select user_id, payload from events where type='marketing_unsubscribed'");
    expect(ev?.user_id).toBe("u1");
    expect(JSON.parse(String(ev?.payload)).source).toBe("link");

    // idempotent
    await unsubscribeEmail(env, db, "ann@x.test", { source: "link" });
    expect(one(raw, "select count(*) n from email_suppressions")?.n).toBe(1);
  });

  it("admin resubscribe restores consent; only previously-confirmed leads return to confirmed", async () => {
    const { db, raw } = makeTestDb();
    seedUser(raw, "u1", "ann@x.test", true);
    seedLead(raw, "l1", "ann@x.test", "newsletter", "confirmed", "2026-01-01T00:00:00.000Z");
    seedLead(raw, "l2", "ann@x.test", "talking_to_pain", "pending", null);
    await unsubscribeEmail(env, db, "ann@x.test", { source: "link" });

    await resubscribeEmail(env, db, "ann@x.test", { source: "admin", adminEmail: "boss@x.test", reason: "asked by phone" });

    expect(await isSuppressed(db, "ann@x.test")).toBe(false);
    expect(one(raw, "select marketing_consent c from users where id='u1'")?.c).toBe(1);
    expect(raw.prepare("select status from marketing_leads order by id").all().map((r) => r.status))
      .toEqual(["confirmed", "pending"]);
  });

  it("still works before migration 0031: the events log is the fallback", async () => {
    const { db, raw } = makeTestDb({ upTo: "0030" });
    seedUser(raw, "u1", "ann@x.test", true);
    await unsubscribeEmail(env, db, "ann@x.test", { source: "link" });
    expect(one(raw, "select marketing_consent c from users")?.c).toBe(0);
    expect((await loadSuppressions(db)).has("ann@x.test")).toBe(true);
    await resubscribeEmail(env, db, "ann@x.test", { source: "double_opt_in" });
    expect((await loadSuppressions(db)).has("ann@x.test")).toBe(false);
  });
});

describe("unsubscribe tokens", () => {
  it("verify for the right address only, and can't be swapped with a contact token", async () => {
    const url = new URL(await unsubscribeUrl(env, "https://site.test/", "Ann@X.test"));
    const e = url.searchParams.get("e")!;
    const t = url.searchParams.get("t")!;
    expect(e).toBe("ann@x.test");
    expect(await verifyUnsubscribeToken(env, e, t)).toBe(true);
    expect(await verifyUnsubscribeToken(env, "bob@x.test", t)).toBe(false);
    const contactToken = await makeContactToken(env, e); // e.g. from a review link
    expect(await verifyUnsubscribeToken(env, e, contactToken)).toBe(false);
  });
});

describe("daily flows respect consent and opt-outs", () => {
  // Fixed "now" with a birth month whose renewal deadline is ~30 days out.
  const now = new Date(Date.UTC(2026, 10, 1)); // 2026-11-01
  const birthMonth = 12; // deadline end of December → inside the 60-day window

  function seedCertified(raw: Raw, id: string, email: string, consent: boolean) {
    seedUser(raw, id, email, consent, birthMonth);
    raw.prepare(
      `insert into certificates(id,user_id,course_id,verification_code,legal_name_snapshot,course_title_snapshot,
        credit_hours_snapshot,instructor_snapshot,issued_at,status) values (?,?,?,?,?,?,?,?,?,?)`,
    ).run(`c_${id}`, id, "crs", `v_${id}`, "Test Person", "Course", 6, "Jason Young, DC", "2025-06-01T00:00:00.000Z", "issued");
  }

  it("mails consented people, skips the opted-out and the unconsented", async () => {
    const { db, raw } = makeTestDb();
    raw.prepare("insert into courses(id,slug,title) values ('crs','crs','Course')").run();
    seedCertified(raw, "u1", "yes@x.test", true);
    seedCertified(raw, "u2", "no@x.test", false); // unticked the intake box
    seedCertified(raw, "u3", "gone@x.test", true);
    await unsubscribeEmail(env, db, "gone@x.test", { source: "link" }); // also flips consent
    // legacy roster row for the unconsented account holder must NOT sneak them back in
    raw.prepare(
      "insert into imported_contacts(id,email,birth_month,certified,completed_at) values ('ic1','no@x.test',?,1,'2024-01-01T00:00:00.000Z')",
    ).run(birthMonth);
    // a legacy-only contact who unsubscribed
    raw.prepare(
      "insert into imported_contacts(id,email,birth_month,certified,completed_at) values ('ic2','legacy-out@x.test',?,1,'2024-01-01T00:00:00.000Z')",
    ).run(birthMonth);
    await unsubscribeEmail(env, db, "legacy-out@x.test", { source: "link" });

    const res = await runDailyFlows(env, db, now);

    const sentTo = raw
      .prepare("select payload from events where type='flow_email'")
      .all()
      .map((r) => JSON.parse(String(r.payload)).to);
    expect(sentTo).toEqual(["yes@x.test"]);
    expect(res.renewalSent).toBe(1);
    expect(res.optedOut).toBe(1); // legacy-out (gone@ was already dropped by its consent flag)
    expect(res.errors).toEqual([]);

    // The dev mailer logs the message text; the reminder carries that
    // recipient's own unsubscribe link in its footer.
    const logged = warn.mock.calls.map((c) => String(c[0])).find((t) => t.includes("to: yes@x.test"));
    expect(logged).toContain("Unsubscribe from these emails: https://site.test/unsubscribe?e=yes%40x.test&t=");
  });
});
