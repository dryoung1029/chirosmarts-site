/**
 * Test-only: a real SQLite database with every migration in ./migrations
 * applied, wrapped in Drizzle with the app's schema, so DB logic can be tested
 * against the SQL Drizzle actually emits rather than mocks. Uses Node's
 * built-in `node:sqlite` (no extra dependency). D1 is SQLite, so this catches
 * real SQL errors: bad upserts, missing columns, constraint violations.
 */
import { DatabaseSync } from "node:sqlite";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { drizzle } from "drizzle-orm/sqlite-proxy";
import * as schema from "@/db/schema";
import type { Db } from "@/db/client";

const MIGRATIONS = new URL("../../migrations", import.meta.url).pathname;

export function makeTestDb(opts: { upTo?: string } = {}): { db: Db; raw: DatabaseSync } {
  // D1 accepts legacy double-quoted string literals; migration 0001 relies on it.
  const raw = new DatabaseSync(":memory:", { enableDoubleQuotedStringLiterals: true });
  raw.exec("PRAGMA foreign_keys = ON;");
  const files = readdirSync(MIGRATIONS).filter((f) => f.endsWith(".sql")).sort();
  for (const f of files) {
    if (opts.upTo && f > opts.upTo) break;
    for (const stmt of readFileSync(join(MIGRATIONS, f), "utf8").split("--> statement-breakpoint")) {
      if (stmt.trim()) raw.exec(stmt);
    }
  }
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
