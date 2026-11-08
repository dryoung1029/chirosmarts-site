/**
 * Turn an opaque D1/SQLite error into a clear, actionable message. D1 caps each
 * query at 100 bound parameters and limits query size; when an insert batch is
 * too large the raw error ("too many SQL variables") is cryptic, so map the
 * known limit signatures to plain language and pass everything else through.
 */
export function describeDbError(e: unknown): string {
  const raw = e instanceof Error ? e.message : String(e);
  if (/too many SQL variables|bound parameters|expression tree is too large|too many terms/i.test(raw)) {
    return "Database limit hit while saving (too many rows in one write). This is a batch-size bug — please report it.";
  }
  if (/too many|limit/i.test(raw) && /SQL|D1|query/i.test(raw)) {
    return `Database limit hit while saving: ${raw}`;
  }
  return raw;
}

/**
 * True when a write failed because the column isn't in the database yet —
 * i.e. code has shipped ahead of its migration. Lets a caller degrade to the
 * pre-migration shape instead of 500ing while the schema catches up.
 */
export function isMissingColumn(e: unknown): boolean {
  const raw = errorText(e);
  return /no such column|has no column named/i.test(raw);
}

/** True when a query failed because the TABLE isn't in the database yet. */
export function isMissingTable(e: unknown): boolean {
  const raw = errorText(e);
  return /no such table/i.test(raw);
}

/** Drizzle wraps the driver error: its own message is just the SQL, and the
 *  reason ("no such table: …") is on `cause`. Check both. */
function errorText(e: unknown): string {
  const own = e instanceof Error ? e.message : String(e);
  const cause = e instanceof Error && e.cause instanceof Error ? e.cause.message : "";
  return `${own}\n${cause}`;
}
