import { describe, it, expect } from "vitest";
import {
  creditedSeconds,
  resumePosition,
  coverageFromHeartbeats,
} from "@/lib/seat-time";

// Compliance core. Credited time = length of the UNION of unique video-position
// coverage, capped at the content duration. Rewatching never double-counts;
// credit can never exceed the content length. These tests are the contract.
describe("creditedSeconds", () => {
  it("is 0 with no coverage", () => {
    expect(creditedSeconds([], 600)).toBe(0);
  });

  it("credits a single watched interval", () => {
    expect(creditedSeconds([{ start: 0, end: 120 }], 600)).toBe(120);
  });

  it("merges overlapping intervals (no double-count)", () => {
    // [0,100] and [50,150] cover [0,150] = 150s, not 250.
    expect(
      creditedSeconds(
        [
          { start: 0, end: 100 },
          { start: 50, end: 150 },
        ],
        600,
      ),
    ).toBe(150);
  });

  it("merges exactly-adjacent (touching) intervals", () => {
    expect(
      creditedSeconds(
        [
          { start: 0, end: 100 },
          { start: 100, end: 200 },
        ],
        600,
      ),
    ).toBe(200);
  });

  it("preserves gaps between disjoint intervals", () => {
    // [0,60] + [120,180] = 120s credited; the 60s gap is not watched.
    expect(
      creditedSeconds(
        [
          { start: 0, end: 60 },
          { start: 120, end: 180 },
        ],
        600,
      ),
    ).toBe(120);
  });

  it("does not double-count a full rewatch", () => {
    expect(
      creditedSeconds(
        [
          { start: 0, end: 300 },
          { start: 0, end: 300 },
          { start: 0, end: 300 },
        ],
        300,
      ),
    ).toBe(300);
  });

  it("handles out-of-order heartbeats", () => {
    expect(
      creditedSeconds(
        [
          { start: 200, end: 260 },
          { start: 0, end: 60 },
          { start: 100, end: 160 },
        ],
        600,
      ),
    ).toBe(180);
  });

  it("caps credited time at the content duration", () => {
    // A heartbeat overshooting the real duration cannot inflate credit.
    expect(creditedSeconds([{ start: 0, end: 9999 }], 600)).toBe(600);
  });

  it("clamps individual endpoints into [0, duration]", () => {
    expect(creditedSeconds([{ start: -50, end: 700 }], 600)).toBe(600);
    expect(creditedSeconds([{ start: 590, end: 650 }], 600)).toBe(10);
  });

  it("drops reversed/zero-length intervals (conservative)", () => {
    // end <= start contributes nothing (likely a seek-back artifact).
    expect(creditedSeconds([{ start: 100, end: 50 }], 600)).toBe(0);
    expect(creditedSeconds([{ start: 100, end: 100 }], 600)).toBe(0);
  });

  it("returns 0 for non-positive durations", () => {
    expect(creditedSeconds([{ start: 0, end: 100 }], 0)).toBe(0);
  });

  it("handles fractional positions", () => {
    expect(creditedSeconds([{ start: 0.5, end: 10.25 }], 600)).toBeCloseTo(9.75);
  });

  it("realistic 10-min lesson watched in scrubbed pieces reaches full credit", () => {
    const hb = [
      { start: 0, end: 45 },
      { start: 45, end: 90 },
      { start: 80, end: 130 }, // small rewatch overlap
      { start: 130, end: 300 },
      { start: 300, end: 600 },
    ];
    expect(creditedSeconds(hb, 600)).toBe(600);
  });
});

describe("resumePosition", () => {
  it("is 0 with no coverage", () => {
    expect(resumePosition([], 600)).toBe(0);
  });

  it("is the furthest watched position", () => {
    expect(
      resumePosition(
        [
          { start: 0, end: 60 },
          { start: 200, end: 260 },
          { start: 100, end: 160 },
        ],
        600,
      ),
    ).toBe(260);
  });

  it("never exceeds duration", () => {
    expect(resumePosition([{ start: 0, end: 9999 }], 600)).toBe(600);
  });
});

describe("coverageFromHeartbeats", () => {
  it("maps heartbeat rows to coverage intervals, ignoring null positions", () => {
    const rows = [
      { positionStartSeconds: 0, positionEndSeconds: 45 },
      { positionStartSeconds: 45, positionEndSeconds: 90 },
      { positionStartSeconds: null, positionEndSeconds: 30 }, // not a heartbeat
      { positionStartSeconds: 90, positionEndSeconds: null },
    ];
    expect(coverageFromHeartbeats(rows)).toEqual([
      { start: 0, end: 45 },
      { start: 45, end: 90 },
    ]);
  });
});
