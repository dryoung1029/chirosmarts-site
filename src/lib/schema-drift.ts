/**
 * Schema-drift check: does the live database have every table and column
 * that THIS build's schema.ts expects, and every migration this build ships?
 *
 * Why it exists: Cloudflare Pages deploys on push to main, but migrations
 * are applied separately. Code that reaches production before its migration
 * breaks every query that names the new column, which is exactly how lead
 * capture went down in October. This turns that into a loud, specific signal
 * ("marketing_leads: no such column: tags") within minutes of a deploy.
 *
 * Read-only: one `SELECT … LIMIT 1` per table (a bare select names every
 * column the schema declares) plus a read of D1's own migrations ledger.
 */
import { is } from "drizzle-orm";
import { SQLiteTable, getTableConfig } from "drizzle-orm/sqlite-core";
import type { Db } from "@/db/client";
import * as schema from "@/db/schema";

// Migration filenames bundled into this build (keys only; files aren't read).
const SHIPPED = Object.keys(import.meta.glob("/migrations/*.sql"))
  .map((p) => p.split("/").pop()!)
  .sort();

export interface DriftReport {
  ok: boolean;
  tables: number;
  /** table name → the database's error, for every table that failed. */
  problems: Record<string, string>;
  /** Migrations in this build that the database hasn't recorded as applied. */
  unappliedMigrations: string[] | null; // null = ledger unreadable
}

const reason = (e: unknown) => {
  const own = e instanceof Error ? e.message : String(e);
  const cause = e instanceof Error && e.cause instanceof Error ? e.cause.message : "";
  return (cause || own).slice(0, 300);
};

export async function checkSchemaDrift(db: Db, d1: D1Database): Promise<DriftReport> {
  const tables = (Object.values(schema) as unknown[]).filter((v): v is SQLiteTable => is(v, SQLiteTable));
  const problems: Record<string, string> = {};
  for (const t of tables) {
    try {
      await db.select().from(t).limit(1).all();
    } catch (e) {
      problems[getTableConfig(t).name] = reason(e);
    }
  }

  let unapplied: string[] | null = null;
  try {
    const rows = await d1.prepare("select name from d1_migrations").all<{ name: string }>();
    const applied = new Set((rows.results ?? []).map((r) => r.name));
    unapplied = SHIPPED.filter((m) => !applied.has(m));
  } catch {
    unapplied = null; // e.g. a database created without wrangler's ledger
  }

  return {
    ok: Object.keys(problems).length === 0 && (unapplied?.length ?? 0) === 0,
    tables: tables.length,
    problems,
    unappliedMigrations: unapplied,
  };
}
