/**
 * export-transcripts — assemble ChiroSmarts video transcripts into Markdown
 * for voice & style analysis.
 *
 * The transcripts of record live in the production D1 table `lesson_transcripts`
 * (one row per caption cue). This tool joins them to courses → modules → lessons,
 * reconstructs each video's cues into continuous prose (rewatch-free, in order),
 * and writes one Markdown document (optionally one file per course).
 *
 * It never touches the database itself — it formats the JSON that
 * `wrangler d1 execute --json` produces, so the production read stays an
 * explicit, owner-run step.
 *
 * ── USAGE ───────────────────────────────────────────────────────────────────
 * 1. Dump the transcripts from D1 (run where wrangler is authenticated):
 *
 *      npx wrangler d1 execute chirosmarts --remote --json \
 *        --command "SELECT c.slug AS course_slug, c.title AS course_title, \
 *          m.position AS module_position, m.title AS module_title, \
 *          l.position AS lesson_position, l.id AS lesson_id, l.title AS lesson_title, \
 *          l.duration_seconds AS duration_seconds, t.chunk_index AS chunk_index, \
 *          t.start_seconds AS start_seconds, t.text AS text \
 *        FROM lesson_transcripts t \
 *        JOIN lessons l ON l.id = t.lesson_id \
 *        JOIN modules m ON m.id = l.module_id \
 *        JOIN courses c ON c.id = m.course_id \
 *        ORDER BY c.slug, m.position, l.position, t.chunk_index;" \
 *        > transcripts.json
 *
 * 2. Render Markdown:
 *
 *      node --experimental-strip-types scripts/export-transcripts.ts \
 *        --from-json transcripts.json --out chirosmarts-transcripts.md
 *
 *    Flags:
 *      --from-json <file>   read wrangler --json output from a file (else stdin)
 *      --out <file>         write the combined Markdown here (else stdout)
 *      --split-dir <dir>    also write one <course_slug>.md per course into <dir>
 *      --timestamps         keep [mm:ss] markers instead of continuous prose
 *
 *    Piped one-liner (no intermediate file):
 *      npx wrangler d1 execute chirosmarts --remote --json --command "<the SELECT above>" \
 *        | node --experimental-strip-types scripts/export-transcripts.ts --out chirosmarts-transcripts.md
 */
import { readFile, writeFile, mkdir } from "node:fs/promises";
import { spawnSync } from "node:child_process";
import { join } from "node:path";

/** The transcripts-of-record query: every cue joined to its lesson/module/course. */
const TRANSCRIPT_QUERY =
  "SELECT c.slug AS course_slug, c.title AS course_title, " +
  "m.position AS module_position, m.title AS module_title, " +
  "l.position AS lesson_position, l.id AS lesson_id, l.title AS lesson_title, " +
  "l.duration_seconds AS duration_seconds, t.chunk_index AS chunk_index, " +
  "t.start_seconds AS start_seconds, t.text AS text " +
  "FROM lesson_transcripts t " +
  "JOIN lessons l ON l.id = t.lesson_id " +
  "JOIN modules m ON m.id = l.module_id " +
  "JOIN courses c ON c.id = m.course_id " +
  "ORDER BY c.slug, m.position, l.position, t.chunk_index;";

/** Run the query through wrangler and return its --json stdout. Needs CF auth. */
function queryD1(remote: boolean): string {
  const args = ["wrangler", "d1", "execute", "chirosmarts", remote ? "--remote" : "--local", "--json", "--command", TRANSCRIPT_QUERY];
  const r = spawnSync("npx", args, { encoding: "utf8", maxBuffer: 256 * 1024 * 1024 });
  if (r.status !== 0) {
    throw new Error(`wrangler d1 execute failed (${remote ? "remote" : "local"}):\n${r.stderr || r.stdout}`);
  }
  return r.stdout;
}

type Row = {
  course_slug?: string | null;
  course_title?: string | null;
  module_position?: number | null;
  module_title?: string | null;
  lesson_position?: number | null;
  lesson_id: string;
  lesson_title?: string | null;
  duration_seconds?: number | null;
  chunk_index: number;
  start_seconds?: number | null;
  end_seconds?: number | null;
  text: string;
};

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`);
  return i !== -1 ? process.argv[i + 1] : undefined;
}
const hasFlag = (name: string) => process.argv.includes(`--${name}`);

async function readStdin(): Promise<string> {
  const chunks: Buffer[] = [];
  for await (const c of process.stdin) chunks.push(c as Buffer);
  return Buffer.concat(chunks).toString("utf8");
}

/** Accept wrangler's `[{results:[...]}]`, a bare `{results:[...]}`, or a plain row array. */
function extractRows(raw: string): Row[] {
  const data = JSON.parse(raw);
  if (Array.isArray(data)) {
    if (data.length && "results" in data[0]) {
      return data.flatMap((stmt: any) => stmt.results ?? []);
    }
    return data as Row[];
  }
  if (data && Array.isArray(data.results)) return data.results as Row[];
  throw new Error("Unrecognized JSON shape — expected wrangler --json output or an array of rows.");
}

const mmss = (s: number | null | undefined) => {
  if (s == null) return "?";
  const m = Math.floor(s / 60);
  const sec = Math.round(s % 60);
  return `${m}:${sec.toString().padStart(2, "0")}`;
};

const words = (s: string) => (s.trim() ? s.trim().split(/\s+/).length : 0);

/**
 * Join ordered cues into readable prose. Cues often break mid-sentence, so we
 * concatenate with single spaces, normalize whitespace, then soft-wrap into
 * paragraphs at sentence boundaries roughly every ~600 chars.
 */
function toProse(texts: string[]): string {
  const joined = texts.join(" ").replace(/\s+/g, " ").trim();
  const sentences = joined.match(/[^.!?]+[.!?]+(?:["')\]]+)?|\S+$/g) ?? [joined];
  const paras: string[] = [];
  let buf = "";
  for (const sentence of sentences) {
    buf += (buf ? " " : "") + sentence.trim();
    if (buf.length >= 600) {
      paras.push(buf);
      buf = "";
    }
  }
  if (buf) paras.push(buf);
  return paras.join("\n\n");
}

function withTimestamps(rows: Row[]): string {
  return rows
    .map((r) => `**[${mmss(r.start_seconds)}]** ${r.text.replace(/\s+/g, " ").trim()}`)
    .join("\n\n");
}

type Lesson = { id: string; title: string; position: number; duration: number | null; rows: Row[] };
type Module = { title: string; position: number; lessons: Map<string, Lesson> };
type Course = { slug: string; title: string; modules: Map<string, Module> };

function group(rows: Row[]): Course[] {
  const courses = new Map<string, Course>();
  for (const r of rows) {
    const cslug = r.course_slug ?? "uncategorized";
    const ckey = cslug;
    let course = courses.get(ckey);
    if (!course) {
      course = { slug: cslug, title: r.course_title ?? cslug, modules: new Map() };
      courses.set(ckey, course);
    }
    const mkey = `${r.module_position ?? 0}::${r.module_title ?? ""}`;
    let mod = course.modules.get(mkey);
    if (!mod) {
      mod = { title: r.module_title ?? "Module", position: r.module_position ?? 0, lessons: new Map() };
      course.modules.set(mkey, mod);
    }
    let lesson = mod.lessons.get(r.lesson_id);
    if (!lesson) {
      lesson = {
        id: r.lesson_id,
        title: r.lesson_title ?? r.lesson_id,
        position: r.lesson_position ?? 0,
        duration: r.duration_seconds ?? null,
        rows: [],
      };
      mod.lessons.set(r.lesson_id, lesson);
    }
    lesson.rows.push(r);
  }
  // Deterministic order everywhere.
  const out = [...courses.values()].sort((a, b) => a.slug.localeCompare(b.slug));
  for (const c of out) {
    for (const m of c.modules.values()) {
      for (const l of m.lessons.values()) l.rows.sort((a, b) => a.chunk_index - b.chunk_index);
    }
  }
  return out;
}

function renderCourse(course: Course, keepTimestamps: boolean): { md: string; videos: number; words: number } {
  const mods = [...course.modules.values()].sort((a, b) => a.position - b.position);
  let md = `# ${course.title}\n\n`;
  let videos = 0;
  let totalWords = 0;
  for (const m of mods) {
    md += `## Module ${m.position} — ${m.title}\n\n`;
    const lessons = [...m.lessons.values()].sort((a, b) => a.position - b.position);
    for (const l of lessons) {
      const body = keepTimestamps ? withTimestamps(l.rows) : toProse(l.rows.map((r) => r.text));
      const w = words(l.rows.map((r) => r.text).join(" "));
      videos += 1;
      totalWords += w;
      md += `### ${l.title}\n`;
      md += `\`${l.id}\` · ${mmss(l.duration)} runtime · ${l.rows.length} cues · ${w.toLocaleString()} words\n\n`;
      md += `${body}\n\n`;
    }
  }
  return { md: md.trimEnd() + "\n", videos, words: totalWords };
}

async function main() {
  const fromJson = arg("from-json");
  const outPath = arg("out");
  const splitDir = arg("split-dir");
  const keepTimestamps = hasFlag("timestamps");

  const remote = hasFlag("remote");
  const local = hasFlag("local");
  const raw = remote || local
    ? queryD1(remote) // runs wrangler itself (needs CF auth) — one-command export
    : fromJson
      ? await readFile(fromJson, "utf8")
      : await readStdin();
  const rows = extractRows(raw);
  if (!rows.length) {
    console.error("No transcript rows found in the input.");
    process.exit(1);
  }

  const courses = group(rows);
  const rendered = courses.map((c) => ({ course: c, ...renderCourse(c, keepTimestamps) }));

  const totalVideos = rendered.reduce((n, r) => n + r.videos, 0);
  const totalWords = rendered.reduce((n, r) => n + r.words, 0);
  const stamp = new Date().toISOString().slice(0, 10);

  let combined =
    `# ChiroSmarts Course Transcripts\n\n` +
    `_Exported for voice & style analysis — ${totalVideos} videos across ${rendered.length} course(s), ~${totalWords.toLocaleString()} words. Generated ${stamp}._\n\n` +
    (keepTimestamps
      ? `_Each cue is shown with its \`[mm:ss]\` start marker._\n\n`
      : `_Cues reconstructed into continuous prose in playback order (rewatch-free); timestamps omitted for readability. Re-run with \`--timestamps\` to keep them._\n\n`) +
    `---\n\n`;
  combined += rendered.map((r) => r.md).join("\n---\n\n");

  if (outPath) {
    await writeFile(outPath, combined, "utf8");
    console.error(`✓ wrote ${outPath} — ${totalVideos} videos, ${rendered.length} course(s), ${totalWords.toLocaleString()} words`);
  } else {
    process.stdout.write(combined);
  }

  if (splitDir) {
    await mkdir(splitDir, { recursive: true });
    for (const r of rendered) {
      const file = join(splitDir, `${r.course.slug}.md`);
      await writeFile(file, r.md, "utf8");
      console.error(`  · ${file} (${r.videos} videos)`);
    }
  }
}

main().catch((e) => {
  console.error(`\n✗ ${e?.message ?? String(e)}\n`);
  process.exit(1);
});
