/**
 * Seat-time compliance core (see CLAUDE.md §1, PLAN.md §5).
 *
 * Credited seat time = the length of the UNION of unique video-position coverage,
 * capped at the content duration. Rewatching never double-counts and credit can
 * never exceed the content length. This is the single most compliance-sensitive
 * piece of the platform, so it is a PURE, dependency-free, unit-tested function —
 * the seat-time total is always RECOMPUTED from heartbeat events, never stored.
 */

export interface Coverage {
  start: number; // content-seconds
  end: number; // content-seconds
}

/** Shape of the heartbeat columns we read off `events` rows. */
export interface HeartbeatLike {
  positionStartSeconds: number | null;
  positionEndSeconds: number | null;
}

function clamp(v: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, v));
}

/**
 * Pull the position interval off heartbeat rows, dropping any without both
 * endpoints (e.g. non-heartbeat events sharing the table).
 */
export function coverageFromHeartbeats(rows: HeartbeatLike[]): Coverage[] {
  const out: Coverage[] = [];
  for (const r of rows) {
    if (r.positionStartSeconds == null || r.positionEndSeconds == null) continue;
    out.push({ start: r.positionStartSeconds, end: r.positionEndSeconds });
  }
  return out;
}

/**
 * Total credited content-seconds = length of the union of covered intervals,
 * clamped to [0, durationSeconds].
 *
 * Each interval's endpoints are clamped into the valid range; reversed or
 * zero-length intervals (end ≤ start) are dropped as anomalous (e.g. a seek-back
 * artifact) so they can never inflate credit. Intervals that touch exactly
 * (e.g. [0,100] and [100,200]) merge into one.
 */
export function creditedSeconds(
  coverage: Coverage[],
  durationSeconds: number,
): number {
  if (durationSeconds <= 0) return 0;

  const intervals = coverage
    .map((c) => ({
      start: clamp(c.start, 0, durationSeconds),
      end: clamp(c.end, 0, durationSeconds),
    }))
    .filter((c) => c.end > c.start)
    .sort((a, b) => a.start - b.start);

  let total = 0;
  let curStart = Number.NEGATIVE_INFINITY;
  let curEnd = Number.NEGATIVE_INFINITY;
  for (const c of intervals) {
    if (c.start > curEnd) {
      // Disjoint from the current run — bank the run and start a new one.
      if (curEnd > curStart) total += curEnd - curStart;
      curStart = c.start;
      curEnd = c.end;
    } else {
      // Overlapping or touching — extend the current run.
      curEnd = Math.max(curEnd, c.end);
    }
  }
  if (curEnd > curStart) total += curEnd - curStart;

  return Math.min(total, durationSeconds);
}

/** The furthest content-position reached, clamped to duration (for resume). */
export function resumePosition(
  coverage: Coverage[],
  durationSeconds: number,
): number {
  if (durationSeconds <= 0) return 0;
  let max = 0;
  for (const c of coverage) {
    const end = clamp(Math.max(c.start, c.end), 0, durationSeconds);
    if (end > max) max = end;
  }
  return max;
}

/** Convenience: credited content-minutes (used by the final-exam gate). */
export function creditedMinutes(
  coverage: Coverage[],
  durationSeconds: number,
): number {
  return creditedSeconds(coverage, durationSeconds) / 60;
}
