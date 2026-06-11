import { describe, it, expect } from "vitest";
import {
  scoreAttempt,
  isPassing,
  type ScorableQuestion,
} from "@/lib/quiz-scoring";

const single = (id: string, correct: string): ScorableQuestion => ({
  id,
  type: "single_choice",
  options: [
    { id: `${id}_a`, isCorrect: correct === "a" },
    { id: `${id}_b`, isCorrect: correct === "b" },
    { id: `${id}_c`, isCorrect: correct === "c" },
  ],
});

const multi = (id: string, correct: string[]): ScorableQuestion => ({
  id,
  type: "multi_choice",
  options: ["a", "b", "c", "d"].map((k) => ({
    id: `${id}_${k}`,
    isCorrect: correct.includes(k),
  })),
});

describe("scoreAttempt", () => {
  it("scores an all-correct single-choice quiz as 1.0", () => {
    const qs = [single("q1", "b"), single("q2", "a")];
    const r = scoreAttempt(qs, { q1: ["q1_b"], q2: ["q2_a"] });
    expect(r.score).toBe(1);
    expect(r.correctCount).toBe(2);
  });

  it("counts a wrong single-choice answer as incorrect", () => {
    const qs = [single("q1", "b"), single("q2", "a")];
    const r = scoreAttempt(qs, { q1: ["q1_c"], q2: ["q2_a"] });
    expect(r.score).toBe(0.5);
  });

  it("treats unanswered questions as incorrect", () => {
    const qs = [single("q1", "b"), single("q2", "a")];
    const r = scoreAttempt(qs, { q1: ["q1_b"] });
    expect(r.score).toBe(0.5);
    expect(r.perQuestion[1].correct).toBe(false);
  });

  it("requires the exact set for multi-choice (no partial credit)", () => {
    const q = multi("q1", ["a", "c"]);
    expect(scoreAttempt([q], { q1: ["q1_a", "q1_c"] }).score).toBe(1);
    expect(scoreAttempt([q], { q1: ["q1_a"] }).score).toBe(0); // missing one
    expect(scoreAttempt([q], { q1: ["q1_a", "q1_c", "q1_b"] }).score).toBe(0); // extra
  });

  it("ignores selections that aren't real options", () => {
    const q = single("q1", "b");
    expect(scoreAttempt([q], { q1: ["q1_b", "bogus"] }).score).toBe(1);
  });

  it("returns 0 for an empty quiz", () => {
    expect(scoreAttempt([], {}).score).toBe(0);
  });

  it("computes 80% across 5 questions", () => {
    const qs = [
      single("q1", "a"),
      single("q2", "a"),
      single("q3", "a"),
      single("q4", "a"),
      single("q5", "a"),
    ];
    const r = scoreAttempt(qs, {
      q1: ["q1_a"],
      q2: ["q2_a"],
      q3: ["q3_a"],
      q4: ["q4_a"],
      q5: ["q5_b"], // one wrong
    });
    expect(r.score).toBeCloseTo(0.8);
  });
});

describe("isPassing", () => {
  it("passes exactly at threshold (float-safe)", () => {
    expect(isPassing(0.8, 0.8)).toBe(true);
    expect(isPassing(4 / 5, 0.8)).toBe(true);
  });
  it("fails below threshold", () => {
    expect(isPassing(0.79, 0.8)).toBe(false);
    expect(isPassing(0.6, 0.8)).toBe(false);
  });
});
