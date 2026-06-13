/**
 * generate-captions — one command to caption a lesson's Stream video and feed
 * the transcript to the AI tutor.
 *
 * For a lesson that already has a `stream_video_uid`, this:
 *   1. asks Cloudflare Stream to AI-generate the caption for --language (en),
 *   2. polls until the caption is "ready" (generation scales with video length),
 *   3. downloads the generated WebVTT,
 *   4. ingests it into `lesson_transcripts` (one row per cue, replacing any prior).
 * The caption now lives on the Stream video too, so subtitles show in the player.
 *
 * Usage:
 *   node --experimental-strip-types scripts/generate-captions.ts --lesson <lessonId> [--language en] [--remote] [--regenerate] [--dry-run]
 *   # via npm:  npm run captions -- --lesson <lessonId> --remote
 *
 * `--remote` reads/writes production D1 (use it when the video was attached with
 * --remote). Requires CF_ACCOUNT_ID and CF_STREAM_API_TOKEN (env or .dev.vars).
 * After it finishes: re-embed the tutor → Admin → AI tutor → Embed transcripts.
 */
import { readFile } from "node:fs/promises";
import { spawnSync } from "node:child_process";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { writeFileSync } from "node:fs";
import {
  parseTranscript,
  buildTranscriptSql,
} from "../src/lib/transcript.ts";

const CF = "https://api.cloudflare.com/client/v4";

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`);
  return i !== -1 ? process.argv[i + 1] : undefined;
}
const hasFlag = (name: string) => process.argv.includes(`--${name}`);

function fail(msg: string): never {
  console.error(`\n✗ ${msg}\n`);
  process.exit(1);
}

/** Load CF creds from the environment, falling back to .dev.vars. */
async function loadEnv(): Promise<Record<string, string>> {
  const out: Record<string, string> = { ...process.env } as Record<string, string>;
  try {
    const raw = await readFile(new URL("../.dev.vars", import.meta.url), "utf8");
    for (const line of raw.split("\n")) {
      const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*"?([^"]*)"?\s*$/);
      if (m && !out[m[1]]) out[m[1]] = m[2];
    }
  } catch {
    /* no .dev.vars — environment only */
  }
  return out;
}

/** Run a read-only SQL query against D1 and return the first row (or null). */
function queryD1Row(sql: string, remote: boolean): Record<string, unknown> | null {
  const args = [
    "wrangler",
    "d1",
    "execute",
    "chirosmarts",
    remote ? "--remote" : "--local",
    "--json",
    `--command=${sql}`,
  ];
  const r = spawnSync("npx", args, { encoding: "utf8" });
  if (r.status !== 0) fail(`wrangler d1 query failed:\n${r.stderr || r.stdout}`);
  // --json prints a JSON array; tolerate any leading log noise.
  const text = r.stdout.slice(r.stdout.indexOf("["), r.stdout.lastIndexOf("]") + 1);
  try {
    const parsed = JSON.parse(text) as Array<{ results?: Record<string, unknown>[] }>;
    return parsed[0]?.results?.[0] ?? null;
  } catch {
    fail(`couldn't parse D1 response:\n${r.stdout}`);
  }
}

function applySql(sql: string, remote: boolean): void {
  const file = join(tmpdir(), `cs-captions-${Date.now()}.sql`);
  writeFileSync(file, sql);
  const args = [
    "wrangler",
    "d1",
    "execute",
    "chirosmarts",
    remote ? "--remote" : "--local",
    `--file=${file}`,
  ];
  console.log(`→ ingesting transcript into D1 (${remote ? "remote" : "local"})…`);
  const r = spawnSync("npx", args, { stdio: "inherit" });
  if (r.status !== 0) fail("wrangler d1 execute failed");
}

interface Caption {
  language: string;
  label?: string;
  generated?: boolean;
  status?: "inprogress" | "ready" | "error";
}

async function cfJson(env: Record<string, string>, method: string, path: string): Promise<any> {
  const account = env.CF_ACCOUNT_ID || fail("CF_ACCOUNT_ID not set");
  const token = env.CF_STREAM_API_TOKEN || fail("CF_STREAM_API_TOKEN not set");
  const res = await fetch(`${CF}/accounts/${account}/stream/${path}`, {
    method,
    headers: { Authorization: `Bearer ${token}` },
  });
  const data: any = await res.json().catch(() => ({}));
  if (!res.ok || data.success === false) {
    fail(`Cloudflare API error (${method} ${path}): ${JSON.stringify(data.errors ?? data)}`);
  }
  return data.result;
}

async function getCaption(
  env: Record<string, string>,
  uid: string,
  lang: string,
): Promise<Caption | null> {
  const list: Caption[] = await cfJson(env, "GET", `${uid}/captions`);
  return list.find((c) => c.language === lang) ?? null;
}

async function main() {
  const lessonId = arg("lesson") || fail("--lesson <lessonId> is required");
  const lang = arg("language") || "en";
  const remote = hasFlag("remote");
  const regenerate = hasFlag("regenerate");
  const dryRun = hasFlag("dry-run");

  if (dryRun) {
    console.log(
      `\n--- DRY RUN ---\nWould: look up lesson ${lessonId}'s Stream video in ${remote ? "remote" : "local"} D1, ` +
        `generate/fetch its "${lang}" caption, then ingest the WebVTT into lesson_transcripts. No API or DB calls made.`,
    );
    return;
  }

  // Resolve the lesson's attached Stream video.
  const row = queryD1Row(
    `SELECT stream_video_uid AS uid FROM lessons WHERE id = '${lessonId.replace(/'/g, "''")}'`,
    remote,
  );
  if (!row) fail(`lesson ${lessonId} not found in ${remote ? "remote" : "local"} D1`);
  const uid = row.uid as string | null;
  if (!uid) {
    fail(`lesson ${lessonId} has no attached video — attach one first (upload-to-stream --attach-uid).`);
  }
  console.log(`✓ lesson ${lessonId} → Stream video ${uid}`);

  const env = await loadEnv();

  // Decide whether to (re)generate or reuse an existing caption.
  let caption = await getCaption(env, uid, lang);
  if (caption && regenerate) {
    console.log(`→ removing existing ${lang} caption to regenerate…`);
    await cfJson(env, "DELETE", `${uid}/captions/${lang}`);
    caption = null;
  }
  if (!caption) {
    console.log(`→ asking Stream to auto-generate the ${lang} caption…`);
    await cfJson(env, "POST", `${uid}/captions/${lang}/generate`);
  } else if (caption.status === "ready") {
    console.log(`✓ a ready ${lang} caption already exists — fetching it (pass --regenerate to redo).`);
  }

  // Poll until ready. Generation scales with video length, so allow a while.
  if (!caption || caption.status !== "ready") {
    process.stdout.write("→ waiting for Stream to transcribe");
    let ready = false;
    for (let i = 0; i < 240; i++) {
      const c = await getCaption(env, uid, lang);
      if (c?.status === "ready") {
        ready = true;
        break;
      }
      if (c?.status === "error") fail("Stream reported an error generating the caption.");
      process.stdout.write(".");
      await new Promise((r) => setTimeout(r, 5000));
    }
    console.log("");
    if (!ready) {
      fail("timed out waiting for the caption (long videos can take a while) — re-run this command and it'll pick up the ready caption.");
    }
    console.log("  caption ready");
  }

  // Download the generated WebVTT and ingest it.
  const account = env.CF_ACCOUNT_ID!;
  const token = env.CF_STREAM_API_TOKEN!;
  console.log("→ downloading WebVTT…");
  const vttRes = await fetch(`${CF}/accounts/${account}/stream/${uid}/captions/${lang}/vtt`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!vttRes.ok) fail(`couldn't download the VTT (HTTP ${vttRes.status}).`);
  const vtt = await vttRes.text();

  const chunks = parseTranscript(vtt);
  if (chunks.length === 0) fail("the downloaded caption had no cues to ingest.");
  console.log(`✓ parsed ${chunks.length} cues`);

  applySql(buildTranscriptSql(lessonId, chunks), remote);

  console.log(`\n✓ done — lesson ${lessonId}: ${chunks.length} transcript cues ingested, captions live on Stream.`);
  console.log("  Next: re-embed the tutor → Admin → AI tutor → Embed transcripts.");
}

main().catch((e) => fail(e?.message ?? String(e)));
