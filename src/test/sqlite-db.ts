/**
 * Test-only: a real SQLite database with every migration in ./migrations
 * applied, wrapped in Drizzle with the app's schema, so DB logic can be tested
 * against the SQL Drizzle actually emits rather than mocks. Uses Node's
 * built-in `node:sqlite` (no extra dependency). D1 is SQLite, so this catches
 * real SQL errors: bad upserts, missing columns, constraint violations.
 */
import { DatabaseSync } from "node:sqlite";
import { mkdtempSync, readdirSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { drizzle } from "drizzle-orm/sqlite-proxy";
import * as schema from "@/db/schema";
import type { Db } from "@/db/client";

const MIGRATIONS = new URL("../../migrations", import.meta.url).pathname;

export function makeTestDb(opts: { upTo?: string } = {}): { db: Db; raw: DatabaseSync } {
  // Migrations run with legacy double-quoted string literals ON (migration
  // 0001 relies on them), then the file is reopened with them OFF for queries,
  // which matches production D1, where selecting an unmigrated column raises
  // "no such column" instead of silently returning the column name as text.
  const file = join(mkdtempSync(join(tmpdir(), "cs-testdb-")), "db.sqlite");
  const setup = new DatabaseSync(file, { enableDoubleQuotedStringLiterals: true });
  const files = readdirSync(MIGRATIONS).filter((f) => f.endsWith(".sql")).sort();
  for (const f of files) {
    if (opts.upTo && f > opts.upTo) break;
    for (const stmt of readFileSync(join(MIGRATIONS, f), "utf8").split("--> statement-breakpoint")) {
      if (stmt.trim()) setup.exec(stmt);
    }
  }
  setup.close();
  const raw = new DatabaseSync(file);
  raw.exec("PRAGMA foreign_keys = ON;");
  const db = drizzle(
    async (sql, params, method) => {
      const st = raw.prepare(sql);
      if (method === "run") {
        st.run(...(params as never[]));
        return { rows: [] };
      }
      st.setReturnArrays(true);
      if (method === "get") {
        const row = st.get(...(params as never[]));
        return { rows: (row ?? undefined) as never };
      }
      return { rows: st.all(...(params as never[])) as never };
    },
    { schema },
  );
  return { db: db as unknown as Db, raw };
}
