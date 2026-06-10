/**
 * Time helpers. Compliance rule: store everything in UTC, display in
 * America/Los_Angeles.
 */

/** Current instant as a UTC ISO-8601 string (matches the DB default format). */
export function nowIso(): string {
  return new Date().toISOString();
}

/** A UTC ISO string `seconds` in the future. */
export function isoInSeconds(seconds: number): string {
  return new Date(Date.now() + seconds * 1000).toISOString();
}

/** True if the given UTC ISO timestamp is in the past. */
export function isPast(iso: string): boolean {
  return new Date(iso).getTime() < Date.now();
}

const PACIFIC = "America/Los_Angeles";

/** Format a stored UTC ISO timestamp for display in Pacific time. */
export function formatPacific(
  iso: string,
  opts: Intl.DateTimeFormatOptions = {
    dateStyle: "medium",
    timeStyle: "short",
  },
): string {
  return new Intl.DateTimeFormat("en-US", { timeZone: PACIFIC, ...opts }).format(
    new Date(iso),
  );
}
