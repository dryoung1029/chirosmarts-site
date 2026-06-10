/**
 * Transcript parsing for lesson caption files (Riverside exports are WebVTT or
 * SRT). Produces timestamped chunks for `lesson_transcripts` — one row per cue —
 * which serve captions now and power the M6 tutor's retrieval + deep-links.
 *
 * Pure + unit-tested; the upload-to-stream script imports this so ingestion and
 * the tests share one implementation.
 */

export interface TranscriptChunk {
  index: number;
  startSeconds: number;
  endSeconds: number;
  text: string;
}

/** Parse a timestamp like `HH:MM:SS.mmm`, `MM:SS.mmm`, or SRT `HH:MM:SS,mmm`. */
export function parseTimestamp(ts: string): number {
  const clean = ts.trim().replace(",", ".");
  const parts = clean.split(":").map((p) => parseFloat(p));
  if (parts.some((n) => Number.isNaN(n))) return NaN;
  let seconds = 0;
  for (const p of parts) seconds = seconds * 60 + p;
  return seconds;
}

const CUE_LINE = /(\d{1,2}:\d{2}(?::\d{2})?[.,]\d{1,3})\s*-->\s*(\d{1,2}:\d{2}(?::\d{2})?[.,]\d{1,3})/;

/**
 * Parse a WebVTT or SRT document into ordered transcript chunks. Format is
 * auto-detected from the cue timing lines, so both Riverside export styles work.
 */
export function parseTranscript(content: string): TranscriptChunk[] {
  // Normalize newlines and strip a leading WEBVTT header / BOM.
  const normalized = content.replace(/^﻿/, "").replace(/\r\n?/g, "\n");
  const blocks = normalized.split(/\n{2,}/);

  const chunks: TranscriptChunk[] = [];
  let index = 0;
  for (const block of blocks) {
    const lines = block.split("\n").filter((l) => l.trim() !== "");
    if (lines.length === 0) continue;

    // Find the cue-timing line (skips an optional numeric index or cue id above).
    const timingIdx = lines.findIndex((l) => CUE_LINE.test(l));
    if (timingIdx === -1) continue;

    const m = lines[timingIdx].match(CUE_LINE)!;
    const startSeconds = parseTimestamp(m[1]);
    const endSeconds = parseTimestamp(m[2]);
    if (Number.isNaN(startSeconds) || Number.isNaN(endSeconds)) continue;

    const text = lines
      .slice(timingIdx + 1)
      .join(" ")
      .replace(/<[^>]+>/g, "") // drop VTT inline tags
      .replace(/\s+/g, " ")
      .trim();
    if (!text) continue;

    chunks.push({ index: index++, startSeconds, endSeconds, text });
  }
  return chunks;
}

/** SQL-escape a string literal for the generated ingest statements. */
export function sqlString(s: string): string {
  return "'" + s.replace(/'/g, "''") + "'";
}

/**
 * Build the INSERT statements that ingest parsed chunks into `lesson_transcripts`
 * for a lesson (idempotent: clears prior rows for the lesson first).
 */
export function buildTranscriptSql(
  lessonId: string,
  chunks: TranscriptChunk[],
): string {
  const lines = [
    `DELETE FROM lesson_transcripts WHERE lesson_id = ${sqlString(lessonId)};`,
  ];
  for (const c of chunks) {
    const id = `lt_${lessonId}_${c.index}`;
    lines.push(
      `INSERT INTO lesson_transcripts (id, lesson_id, chunk_index, start_seconds, end_seconds, text) VALUES (` +
        `${sqlString(id)}, ${sqlString(lessonId)}, ${c.index}, ${c.startSeconds}, ${c.endSeconds}, ${sqlString(c.text)});`,
    );
  }
  return lines.join("\n");
}
