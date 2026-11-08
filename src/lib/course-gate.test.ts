import { describe, it, expect } from "vitest";
import { courseGate, COMPLETION_THRESHOLD, type GateLesson } from "@/lib/seat-time";

// The rule as it was written inline in getCourseSeatTime before it was
// extracted. Kept here VERBATIM as the reference: courseGate must agree with
// it on every input, or the extraction changed compliance behaviour.
function legacyGate(lessons: GateLesson[], requiredSeatMinutes: number | null) {
  const perLesson: { meetsThreshold: boolean }[] = [];
  let total = 0;
  let totalDuration = 0;
  for (const p of lessons) {
    const fraction = p.durationSeconds > 0 ? p.creditedSeconds / p.durationSeconds : 1;
    const meetsThreshold = fraction >= COMPLETION_THRESHOLD;
    perLesson.push({ meetsThreshold });
    total += p.creditedSeconds;
    totalDuration += p.durationSeconds;
  }
  const requiredSeconds = Math.min(requiredSeatMinutes != null ? requiredSeatMinutes * 60 : 0, totalDuration);
  const examUnlocked = perLesson.length > 0 && perLesson.every((p) => p.meetsThreshold) && total >= requiredSeconds;
  return { total, totalDuration, requiredSeconds, examUnlocked };
}

// Small deterministic PRNG so failures are reproducible.
function rng(seed: number) {
  return () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 2 ** 32);
}

describe("courseGate matches the original inline rule", () => {
  it("on 5,000 random courses", () => {
    const r = rng(42);
    for (let i = 0; i < 5000; i++) {
      const n = Math.floor(r() * 8); // 0..7 lessons (0 = never unlocks)
      const lessons: GateLesson[] = Array.from({ length: n }, () => {
        const durationSeconds = r() < 0.1 ? 0 : Math.floor(r() * 3600);
        // bias toward the 90% boundary
        const frac = r() < 0.5 ? 0.85 + r() * 0.1 : r();
        return { durationSeconds, creditedSeconds: Math.floor(durationSeconds * frac) };
      });
      const req = r() < 0.3 ? null : Math.floor(r() * 400); // sometimes above total runtime
      const a = courseGate(lessons, req);
      const b = legacyGate(lessons, req);
      expect([a.creditedSeconds, a.totalContentSeconds, a.requiredSeconds, a.examUnlocked]).toEqual([
        b.total, b.totalDuration, b.requiredSeconds, b.examUnlocked,
      ]);
    }
  });

  it("edge cases", () => {
    expect(courseGate([], null).examUnlocked).toBe(false);
    expect(courseGate([{ durationSeconds: 0, creditedSeconds: 0 }], null).examUnlocked).toBe(true);
    expect(courseGate([{ durationSeconds: 100, creditedSeconds: 90 }], null).examUnlocked).toBe(true);
    expect(courseGate([{ durationSeconds: 100, creditedSeconds: 89 }], null).examUnlocked).toBe(false);
    // floor above runtime is clamped, so a fully watched course still unlocks
    expect(courseGate([{ durationSeconds: 600, creditedSeconds: 600 }], 60).examUnlocked).toBe(true);
    // floor not yet met even though every lesson is ≥90%
    expect(courseGate([{ durationSeconds: 6000, creditedSeconds: 5400 }], 100).examUnlocked).toBe(false);
  });
});
