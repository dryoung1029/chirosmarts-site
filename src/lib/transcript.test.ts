import { describe, it, expect } from "vitest";
import {
  parseTimestamp,
  parseTranscript,
  buildTranscriptSql,
} from "@/lib/transcript";

describe("parseTimestamp", () => {
  it("parses HH:MM:SS.mmm", () => {
    expect(parseTimestamp("01:02:03.500")).toBeCloseTo(3723.5);
  });
  it("parses MM:SS.mmm", () => {
    expect(parseTimestamp("02:03.250")).toBeCloseTo(123.25);
  });
  it("parses SRT comma millis", () => {
    expect(parseTimestamp("00:00:04,000")).toBe(4);
  });
});

describe("parseTranscript", () => {
  it("parses a WebVTT document", () => {
    const vtt = `WEBVTT

1
00:00:00.000 --> 00:00:03.000
Welcome to ChiroSmarts.

2
00:00:03.000 --> 00:00:07.500
Today we cover Oregon CA scope of practice.`;
    const chunks = parseTranscript(vtt);
    expect(chunks).toHaveLength(2);
    expect(chunks[0]).toEqual({
      index: 0,
      startSeconds: 0,
      endSeconds: 3,
      text: "Welcome to ChiroSmarts.",
    });
    expect(chunks[1].startSeconds).toBe(3);
    expect(chunks[1].endSeconds).toBeCloseTo(7.5);
  });

  it("parses an SRT document", () => {
    const srt = `1
00:00:01,000 --> 00:00:02,500
First line.

2
00:00:02,500 --> 00:00:05,000
Second line
spanning two rows.`;
    const chunks = parseTranscript(srt);
    expect(chunks).toHaveLength(2);
    expect(chunks[0].startSeconds).toBe(1);
    expect(chunks[1].text).toBe("Second line spanning two rows.");
  });

  it("strips VTT inline tags and ignores empty cues", () => {
    const vtt = `WEBVTT

00:00:00.000 --> 00:00:01.000
<v Speaker>Hello</v> there

00:00:01.000 --> 00:00:02.000
`;
    const chunks = parseTranscript(vtt);
    expect(chunks).toHaveLength(1);
    expect(chunks[0].text).toBe("Hello there");
  });

  it("handles CRLF line endings", () => {
    const vtt = "WEBVTT\r\n\r\n00:00:00.000 --> 00:00:01.000\r\nHi\r\n";
    expect(parseTranscript(vtt)[0].text).toBe("Hi");
  });
});

describe("buildTranscriptSql", () => {
  it("clears prior rows then inserts, escaping quotes", () => {
    const sql = buildTranscriptSql("lsn_x", [
      { index: 0, startSeconds: 0, endSeconds: 1, text: "it's fine" },
    ]);
    expect(sql).toContain("DELETE FROM lesson_transcripts WHERE lesson_id = 'lsn_x'");
    expect(sql).toContain("'it''s fine'");
    expect(sql).toContain("chunk_index");
  });
});
