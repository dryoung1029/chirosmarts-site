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
