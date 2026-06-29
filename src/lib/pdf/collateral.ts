/**
 * Collateral Studio — Markdown → branded PDF (P1c).
 *
 * A focused Markdown subset renderer on top of pdf-lib (no new deps): headings
 * (#/##/###), paragraphs, bullet / numbered / checkbox lists, simple tables,
 * horizontal rules, and inline **bold**. Brand header (logo + title) on page 1,
 * a footer (course · page · date) on every page. Letter size, auto-paginated.
 *
 * Output is a printable student handout — checkbox items render as empty boxes
 * to tick on paper regardless of any [x] in the source.
 */
import { PDFDocument, StandardFonts, rgb, type PDFPage, type PDFFont } from "pdf-lib";
import { LOGO_DARK_PNG_BASE64 } from "@/lib/logo-data";

const INK = rgb(0.075, 0.153, 0.169); // #13272B
const ACCENT = rgb(0.043, 0.42, 0.388); // #0B6B63 brand teal
const MUTED = rgb(0.318, 0.392, 0.416); // #51646A
const GOLD = rgb(0.722, 0.525, 0.043); // #B8860B callout accent
const RULE = rgb(0.85, 0.88, 0.87);
const TABLE_HEAD = rgb(0.93, 0.96, 0.95);

const PAGE_W = 612;
const PAGE_H = 792;
const MARGIN = 56;
const CONTENT_W = PAGE_W - MARGIN * 2;
const FOOT_Y = 34; // baseline for footer text

interface Run {
  text: string;
  bold: boolean;
}

// pdf-lib's standard Helvetica only encodes WinAnsi (CP1252). AI-generated
// clinical text often includes characters outside it (≥ ≤ → ✓ Greek, emoji),
// which make drawText throw. Map the common ones to safe equivalents and drop
// anything else outside CP1252.
const CHAR_MAP: Record<string, string> = {
  "≥": ">=", "≤": "<=", "≠": "!=", "≈": "~",
  "→": "->", "←": "<-", "↔": "<->", "⇒": "=>", "⟶": "->",
  "✓": "-", "✔": "-", "☑": "-", "✗": "x", "✘": "x",
  "′": "'", "″": '"',
};
// CP1252 "smart" punctuation pdf-lib encodes natively (codepoints > 0xFF).
const CP1252_EXTRA = "’‘“”–—…•™€‚„†‡‰‹›ƒˆˇ˜";

function winAnsiSafe(input: string): string {
  // Normalize assorted Unicode spaces to a plain space first.
  const s = input.replace(/[\u00a0\u2000-\u200b\u202f\u205f\u3000]/g, " ");
  let out = "";
  for (const ch of s) {
    if (CHAR_MAP[ch] !== undefined) {
      out += CHAR_MAP[ch];
      continue;
    }
    const cp = ch.codePointAt(0) ?? 0;
    if (cp <= 0x7e || (cp >= 0xa0 && cp <= 0xff) || CP1252_EXTRA.includes(ch)) {
      out += ch;
    } else {
      out += ""; // drop unsupported glyphs (emoji, math, Greek, etc.)
    }
  }
  return out;
}

export interface CollateralPdfOpts {
  title: string;
  courseTitle: string;
  typeLabel: string;
  markdown: string;
  generatedDate: string;
  // Single docs hide the body's leading H1 (shown in the header). Manuals set
  // this false so each chapter's H1 renders. A line of exactly `[[newpage]]`
  // forces a page break (used between manual chapters).
  skipFirstH1?: boolean;
}

function decodeBase64(b64: string): Uint8Array {
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

/** Split a line of inline Markdown into bold/plain runs (links/code → text). */
function parseInline(text: string): Run[] {
  const clean = winAnsiSafe(
    text
      .replace(/\[([^\]]+)\]\([^)]*\)/g, "$1") // [t](u) → t
      .replace(/`([^`]+)`/g, "$1"), // `code` → code
  );
  const runs: Run[] = [];
  let bold = false;
  for (const part of clean.split("**")) {
    if (part) runs.push({ text: part.replace(/\*/g, ""), bold });
    bold = !bold;
  }
  return runs.length ? runs : [{ text: "", bold: false }];
}

export async function renderCollateralPdf(
  opts: CollateralPdfOpts,
): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);
  const logo = await doc.embedPng(decodeBase64(LOGO_DARK_PNG_BASE64));

  let page!: PDFPage;
  let y = 0;
  let pageNo = 0;

  const widthOf = (t: string, f: PDFFont, size: number) =>
    f.widthOfTextAtSize(t, size);

  function footer(p: PDFPage) {
    p.drawLine({
      start: { x: MARGIN, y: FOOT_Y + 12 },
      end: { x: PAGE_W - MARGIN, y: FOOT_Y + 12 },
      thickness: 0.5,
      color: RULE,
    });
    p.drawText(winAnsiSafe(`${opts.courseTitle} · ${opts.typeLabel}`), {
      x: MARGIN,
      y: FOOT_Y,
      size: 8,
      font,
      color: MUTED,
    });
    const right = winAnsiSafe(`ChiroSmarts · ${opts.generatedDate}`);
    p.drawText(right, {
      x: PAGE_W - MARGIN - widthOf(right, font, 8),
      y: FOOT_Y,
      size: 8,
      font,
      color: MUTED,
    });
  }

  function pageNumbers() {
    const pages = doc.getPages();
    pages.forEach((p, i) => {
      const label = `Page ${i + 1} of ${pages.length}`;
      p.drawText(label, {
        x: (PAGE_W - widthOf(label, font, 8)) / 2,
        y: FOOT_Y,
        size: 8,
        font,
        color: MUTED,
      });
    });
  }

  function newPage() {
    if (pageNo > 0) footer(page);
    page = doc.addPage([PAGE_W, PAGE_H]);
    pageNo++;
    y = PAGE_H - MARGIN;
  }

  function ensure(h: number) {
    if (y - h < MARGIN + 24) newPage();
  }

  // Lay out runs with word wrap at indent x; returns nothing (updates y).
  function drawParagraph(
    runs: Run[],
    size: number,
    color = INK,
    indent = 0,
    lineGap = 4,
    hangingIndent = indent,
  ) {
    const lineH = size + lineGap;
    const left = MARGIN + indent;
    const maxX = PAGE_W - MARGIN;
    let x = MARGIN + hangingIndent;
    ensure(lineH);

    // Words keep their font; the inter-word space is drawn WITH the word (as a
    // leading space) so PDF text extraction / screen readers keep word breaks.
    const words: Run[] = [];
    for (const r of runs) {
      for (const p of r.text.split(/\s+/))
        if (p !== "") words.push({ text: p, bold: r.bold });
    }

    let atLineStart = true;
    for (const w of words) {
      const f = w.bold ? bold : font;
      const piece = atLineStart ? w.text : " " + w.text;
      const ww = widthOf(piece, f, size);
      if (!atLineStart && x + ww > maxX) {
        y -= lineH;
        ensure(lineH);
        x = left;
        page.drawText(w.text, { x, y, size, font: f, color });
        x += widthOf(w.text, f, size);
        continue;
      }
      page.drawText(piece, { x, y, size, font: f, color });
      x += ww;
      atLineStart = false;
    }
    y -= lineH;
  }

  function hr() {
    ensure(14);
    y -= 6;
    page.drawLine({
      start: { x: MARGIN, y },
      end: { x: PAGE_W - MARGIN, y },
      thickness: 0.5,
      color: RULE,
    });
    y -= 10;
  }

  function blockquote(qlines: string[]) {
    y -= 2;
    ensure(16);
    const topY = y + 10;
    for (const ln of qlines) drawParagraph(parseInline(ln), 10, INK, 16, 4, 16);
    const botY = y + 6;
    if (topY > botY) {
      page.drawRectangle({
        x: MARGIN + 3,
        y: botY,
        width: 3,
        height: topY - botY,
        color: GOLD,
      });
    }
    y -= 4;
  }

  function checkbox(label: Run[]) {
    const size = 10.5;
    const lineH = size + 4;
    ensure(lineH);
    const boxY = y - 1;
    page.drawRectangle({
      x: MARGIN + 2,
      y: boxY - 1,
      width: 9,
      height: 9,
      borderColor: ACCENT,
      borderWidth: 1,
    });
    drawParagraph(label, size, INK, 20, 4, 20);
  }

  function bullet(label: Run[], ordered?: string) {
    const size = 10.5;
    ensure(size + 4);
    page.drawText(ordered ?? "•", {
      x: MARGIN + 4,
      y,
      size,
      font: ordered ? font : bold,
      color: ordered ? INK : ACCENT,
    });
    drawParagraph(label, size, INK, 20, 4, 20);
  }

  function table(rows: string[][]) {
    const cols = rows[0]?.length ?? 0;
    if (!cols) return;
    const colW = CONTENT_W / cols;
    const size = 9.5;
    const padY = 5;
    rows.forEach((cells, ri) => {
      // measure row height by wrapping each cell
      const cellLines = cells.map((c) =>
        wrapPlain(c, font, size, colW - 10),
      );
      const rowH = Math.max(...cellLines.map((l) => l.length)) * (size + 3) + padY * 2;
      ensure(rowH);
      const top = y;
      if (ri === 0) {
        page.drawRectangle({
          x: MARGIN,
          y: top - rowH,
          width: CONTENT_W,
          height: rowH,
          color: TABLE_HEAD,
        });
      }
      cells.forEach((_, ci) => {
        const cx = MARGIN + ci * colW + 5;
        let cy = top - padY - size;
        for (const line of cellLines[ci]) {
          page.drawText(line, {
            x: cx,
            y: cy,
            size,
            font: ri === 0 ? bold : font,
            color: INK,
          });
          cy -= size + 3;
        }
        // vertical separators
        if (ci > 0) {
          page.drawLine({
            start: { x: MARGIN + ci * colW, y: top },
            end: { x: MARGIN + ci * colW, y: top - rowH },
            thickness: 0.4,
            color: RULE,
          });
        }
      });
      page.drawLine({
        start: { x: MARGIN, y: top - rowH },
        end: { x: PAGE_W - MARGIN, y: top - rowH },
        thickness: 0.4,
        color: RULE,
      });
      y = top - rowH;
    });
    y -= 6;
  }

  function wrapPlain(
    text: string,
    f: PDFFont,
    size: number,
    maxW: number,
  ): string[] {
    const words = winAnsiSafe(text).split(/\s+/).filter(Boolean);
    const lines: string[] = [];
    let cur = "";
    for (const w of words) {
      const t = cur ? cur + " " + w : w;
      if (widthOf(t, f, size) > maxW && cur) {
        lines.push(cur);
        cur = w;
      } else cur = t;
    }
    if (cur) lines.push(cur);
    return lines.length ? lines : [""];
  }

  // ---- header (page 1) ----
  newPage();
  const logoH = 22;
  const logoW = (logo.width / logo.height) * logoH;
  page.drawImage(logo, { x: MARGIN, y: y - logoH, width: logoW, height: logoH });
  y -= logoH + 18;
  drawParagraph(parseInline(opts.title), 20, INK, 0, 2);
  y -= 2;
  drawParagraph(
    [{ text: `${opts.courseTitle} · ${opts.typeLabel}`, bold: false }],
    10,
    MUTED,
  );
  y -= 8;
  hr();

  // ---- body ----
  const lines = opts.markdown.replace(/\r\n/g, "\n").split("\n");
  let i = 0;
  let firstH1 = opts.skipFirstH1 !== false;
  while (i < lines.length) {
    const raw = lines[i];
    const line = raw.trimEnd();
    const t = line.trim();

    if (t === "") {
      y -= 4;
      i++;
      continue;
    }
    if (t === "[[newpage]]") {
      newPage();
      i++;
      continue;
    }
    // skip the body's leading H1 (already shown in the header)
    if (firstH1 && /^#\s+/.test(t)) {
      firstH1 = false;
      i++;
      continue;
    }
    if (/^(---|\*\*\*|___)\s*$/.test(t)) {
      hr();
      i++;
      continue;
    }
    if (/^###\s+/.test(t)) {
      y -= 4;
      drawParagraph(parseInline(t.replace(/^###\s+/, "")), 12.5, INK, 0, 3);
      i++;
      continue;
    }
    if (/^##\s+/.test(t)) {
      y -= 8;
      drawParagraph(parseInline(t.replace(/^##\s+/, "")), 15, ACCENT, 0, 4);
      y -= 2;
      i++;
      continue;
    }
    if (/^#\s+/.test(t)) {
      y -= 6;
      drawParagraph(parseInline(t.replace(/^#\s+/, "")), 17, INK, 0, 4);
      i++;
      continue;
    }
    // table: consecutive lines starting with '|'
    if (/^\|/.test(t)) {
      const block: string[] = [];
      while (i < lines.length && /^\s*\|/.test(lines[i].trim())) {
        block.push(lines[i].trim());
        i++;
      }
      const rows = block
        .filter((r) => !/^\|[\s|:-]*\|?$/.test(r)) // drop the |---|---| separator row
        .map((r) =>
          r
            .replace(/^\|/, "")
            .replace(/\|$/, "")
            .split("|")
            .map((c) => c.trim()),
        );
      if (rows.length) table(rows);
      continue;
    }
    // blockquote / callout (consecutive '>' lines) — used for red-flag boxes
    if (/^>\s?/.test(t)) {
      const block: string[] = [];
      while (i < lines.length && /^>\s?/.test(lines[i].trim())) {
        block.push(lines[i].trim().replace(/^>\s?/, ""));
        i++;
      }
      blockquote(block);
      continue;
    }
    // checkbox
    const cb = t.match(/^[-*]\s+\[( |x|X)\]\s+(.*)$/);
    if (cb) {
      checkbox(parseInline(cb[2]));
      i++;
      continue;
    }
    // bullet
    const b = t.match(/^[-*]\s+(.*)$/);
    if (b) {
      bullet(parseInline(b[1]));
      i++;
      continue;
    }
    // numbered
    const n = t.match(/^(\d+)\.\s+(.*)$/);
    if (n) {
      bullet(parseInline(n[2]), `${n[1]}.`);
      i++;
      continue;
    }
    // paragraph
    drawParagraph(parseInline(t), 10.5, INK, 0, 4);
    y -= 3;
    i++;
  }

  footer(page);
  pageNumbers();
  return doc.save();
}

export interface ManualSection {
  title: string;
  markdown: string;
}
export interface ManualPdfOpts {
  manualTitle: string;
  courseTitle: string;
  generatedDate: string;
  sections: ManualSection[];
}

/**
 * Build the combined manual Markdown: a Contents list, then each section as a
 * chapter (its own H1 replaced with the manage-view title). `separator` joins
 * chapters — `[[newpage]]` for the PDF (page break), `---` for a portable .md.
 */
export function buildManualMarkdown(
  sections: ManualSection[],
  separator = "[[newpage]]",
): string {
  const contents = ["## Contents", ""];
  sections.forEach((s, i) => contents.push(`${i + 1}. ${s.title}`));

  const parts: string[] = [contents.join("\n")];
  for (const s of sections) {
    const body = s.markdown.replace(/^\s*#\s+.*(\n|$)/, "").trimStart();
    parts.push(separator);
    parts.push(`# ${s.title}\n\n${body}`);
  }
  return parts.join("\n\n");
}

/**
 * Compile multiple collateral pieces into one branded manual: a title header, a
 * Contents list, then each section as a chapter starting on a new page.
 */
export async function renderManualPdf(
  opts: ManualPdfOpts,
): Promise<Uint8Array> {
  return renderCollateralPdf({
    title: opts.manualTitle,
    courseTitle: opts.courseTitle,
    typeLabel: "Training manual",
    markdown: buildManualMarkdown(opts.sections, "[[newpage]]"),
    generatedDate: opts.generatedDate,
    skipFirstH1: false,
  });
}
