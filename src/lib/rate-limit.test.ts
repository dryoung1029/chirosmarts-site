import { describe, it, expect } from "vitest";
import { makeTestDb } from "@/test/sqlite-db";
import { allowRequest, LIMITS, pruneRateLimits } from "./rate-limit";

const req = (ip: string | null) =>
  new Request("https://x.test/", { headers: ip ? { "cf-connecting-ip": ip } : {} });

describe("allowRequest", () => {
  it("allows up to the limit per IP, then refuses", async () => {
    const { db } = makeTestDb();
    const { limit } = LIMITS.help_contact;
    for (let i = 0; i < limit; i++) expect(await allowRequest(db, req("1.2.3.4"), "help_contact")).toBe(true);
    expect(await allowRequest(db, req("1.2.3.4"), "help_contact")).toBe(false);
    // a different network and a different bucket are unaffected
    expect(await allowRequest(db, req("5.6.7.8"), "help_contact")).toBe(true);
    expect(await allowRequest(db, req("1.2.3.4"), "magic_link")).toBe(true);
  });

  it("never stores the raw IP", async () => {
    const { db, raw } = makeTestDb();
    await allowRequest(db, req("203.0.113.9"), "metrics");
    const keys = raw.prepare("select key from rate_limits").all().map((r) => String(r.key));
    expect(keys.length).toBe(1);
    expect(keys[0]).not.toContain("203.0.113.9");
  });

  it("does not limit without an edge IP (local dev)", async () => {
    const { db } = makeTestDb();
    for (let i = 0; i < 50; i++) expect(await allowRequest(db, req(null), "help_contact")).toBe(true);
  });

  it("fails OPEN when the table isn't migrated yet", async () => {
    const { db } = makeTestDb({ upTo: "0030" });
    expect(await allowRequest(db, req("1.2.3.4"), "magic_link")).toBe(true);
    await pruneRateLimits(db); // and pruning doesn't throw
  });

  it("prunes old windows only", async () => {
    const { db, raw } = makeTestDb();
    raw.exec("insert into rate_limits(key, window_start, count) values ('old', 1, 5)");
    await allowRequest(db, req("1.2.3.4"), "metrics");
    await pruneRateLimits(db);
    const keys = raw.prepare("select key from rate_limits").all().map((r) => String(r.key));
    expect(keys).not.toContain("old");
    expect(keys.length).toBe(1);
  });
});
