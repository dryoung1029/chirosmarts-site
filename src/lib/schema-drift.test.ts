import { describe, it, expect } from "vitest";
import { makeTestDb } from "@/test/sqlite-db";
import { checkSchemaDrift } from "./schema-drift";

// A minimal D1Database stand-in over the same SQLite file, for the ledger read.
const d1 = (raw: ReturnType<typeof makeTestDb>["raw"]) =>
  ({
    prepare: (q: string) => ({
      all: async () => ({ results: raw.prepare(q).all() }),
    }),
  }) as unknown as D1Database;

describe("checkSchemaDrift", () => {
  it("is clean on a fully migrated database", async () => {
    const { db, raw } = makeTestDb();
    raw.exec("create table d1_migrations(id integer primary key, name text)");
    const files = ["0031_magenta_forge.sql"];
    const r = await checkSchemaDrift(db, d1(raw));
    expect(r.problems).toEqual({});
    expect(r.tables).toBeGreaterThan(30);
    // ledger empty here, so every shipped migration is reported as unapplied
    expect(r.unappliedMigrations).toEqual(expect.arrayContaining(files));
    expect(r.ok).toBe(false);
  });

  it("names the exact table and column when code is ahead of the database", async () => {
    const { db, raw } = makeTestDb({ upTo: "0029" }); // before modules.knowledge_check_required
    const r = await checkSchemaDrift(db, d1(raw));
    expect(r.ok).toBe(false);
    expect(r.problems.modules).toMatch(/knowledge_check_required/);
    expect(r.problems.email_suppressions).toMatch(/no such table/);
    expect(r.problems.users).toBeUndefined();
    expect(r.unappliedMigrations).toBeNull(); // no ledger table in the harness
  });
});
