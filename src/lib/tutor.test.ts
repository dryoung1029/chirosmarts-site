import { describe, it, expect } from "vitest";
import { tokenize } from "./tutor";

describe("tokenize", () => {
  it("lowercases, drops stopwords and short words, and dedupes", () => {
    const t = tokenize("How do I take a BLOOD pressure reading reading?");
    expect(t).toContain("blood");
    expect(t).toContain("pressure");
    expect(t).toContain("reading");
    // "how", "do", "a" are stopwords/short; "i" is too short
    expect(t).not.toContain("how");
    expect(t).not.toContain("do");
    // deduped
    expect(t.filter((w) => w === "reading")).toHaveLength(1);
  });

  it("returns no keywords for a stopword-only question", () => {
    expect(tokenize("what is the and for")).toEqual([]);
  });

  it("strips punctuation and splits on non-alphanumerics", () => {
    expect(tokenize("seat-time: minutes!")).toEqual(
      expect.arrayContaining(["seat", "time", "minutes"]),
    );
  });
});
