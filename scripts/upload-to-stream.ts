/**
 * upload-to-stream — M2 content ingestion CLI.
 *
 * For one lesson, this:
 *   1. uploads a Riverside video file to Cloudflare Stream,
 *   2. waits for it to be ready and reads its true duration,
 *   3. attaches the transcript as WebVTT captions on the Stream video,
 *   4. ingests the transcript into `lesson_transcripts` (one row per cue) —
 *      serving captions now and the M6 tutor's retrieval/deep-links later,
 *   5. registers the lesson: sets `stream_video_uid` + `duration_seconds`.
 *
 * Steps 3–5 are applied to D1 via `wrangler d1 execute`.
 *
 * Usage:
 *   node --experimental-strip-types scripts/upload-to-stream.ts \
 *     --lesson <lessonId> --video ./welcome.mp4 --transcript ./welcome.vtt [--name "Welcome"] [--remote]
 *
 *   # attach a video that's ALREADY in Cloudflare Stream (you have the UID):
 *   # reads the true duration from Stream, then sets stream_video_uid +
 *   # duration_seconds on the lesson (the seat-time gate needs the exact runtime).
 *   node --experimental-strip-types scripts/upload-to-stream.ts \
 *     --lesson <lessonId> --attach-uid <streamUid> [--transcript ./welcome.vtt] [--remote]
 *
 *   # parse + preview the transcript/SQL without uploading or touching Stream:
 *   node --experimental-strip-types scripts/upload-to-stream.ts \
 *     --lesson <lessonId> --transcript ./welcome.vtt --dry-run
 *
 * Requires CF_ACCOUNT_ID and CF_STREAM_API_TOKEN (from the environment or
 * .dev.vars) for a real upload or --attach-uid. `--dry-run` needs neither.
 */
import { readFile, writeFile } from "node:fs/promises";
import { spawnSync } from "node:child_process";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  parseTranscript,
  buildTranscriptSql,
  sqlString,
  type TranscriptChunk,
} from "../src/lib/transcript.ts";

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

/** Render parsed chunks back to a WebVTT file for Stream captions. */
function chunksToVtt(chunks: TranscriptChunk[]): string {
  const ts = (s: number) => {
    const hh = Math.floor(s / 3600).toString().padStart(2, "0");
    const mm = Math.floor((s % 3600) / 60).toString().padStart(2, "0");
    const ss = (s % 60).toFixed(3).padStart(6, "0");
    return `${hh}:${mm}:${ss}`;
  };
  let out = "WEBVTT\n\n";
  for (const c of chunks) {
    out += `${c.index + 1}\n${ts(c.startSeconds)} --> ${ts(c.endSeconds)}\n${c.text}\n\n`;
  }
  return out;
}

const CF = "https://api.cloudflare.com/client/v4";

async function uploadVideo(
  env: Record<string, string>,
  videoPath: string,
  name: string,
): Promise<string> {
  const account = env.CF_ACCOUNT_ID || fail("CF_ACCOUNT_ID not set");
  const token = env.CF_STREAM_API_TOKEN || fail("CF_STREAM_API_TOKEN not set");

  console.log(`→ uploading ${videoPath} to Stream…`);
  const bytes = await readFile(videoPath);
  const form = new FormData();
  form.append("file", new Blob([bytes]), name);

  const res = await fetch(`${CF}/accounts/${account}/stream`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}` },
    body: form,
  });
  const data: any = await res.json();
  if (!res.ok || !data.success) {
    fail(`Stream upload failed: ${JSON.stringify(data.errors ?? data)}`);
  }
  const uid = data.result.uid as string;
  console.log(`  uploaded, uid=${uid}`);
  return uid;
}

async function waitForReady(
  env: Record<string, string>,
  uid: string,
): Promise<number> {
  const account = env.CF_ACCOUNT_ID!;
  const token = env.CF_STREAM_API_TOKEN!;
  process.stdout.write("→ waiting for Stream to process");
  for (let i = 0; i < 120; i++) {
    const res = await fetch(`${CF}/accounts/${account}/stream/${uid}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    const data: any = await res.json();
    // Fail fast on a bad UID / auth error instead of polling for 6 minutes.
    if (res.status === 404 || data.success === false) {
      fail(`Stream video not found for uid ${uid} (check the UID and token): ${JSON.stringify(data.errors ?? data)}`);
    }
    const r = data.result;
    if (r?.readyToStream) {
      const duration = Math.round(r.duration ?? 0);
      console.log(`\n  ready, duration=${duration}s`);
      return duration;
    }
    process.stdout.write(".");
    await new Promise((r) => setTimeout(r, 3000));
  }
  fail("timed out waiting for Stream to become ready");
}

async function attachCaptions(
  env: Record<string, string>,
  uid: string,
  vtt: string,
): Promise<void> {
  const account = env.CF_ACCOUNT_ID!;
  const token = env.CF_STREAM_API_TOKEN!;
  console.log("→ attaching English captions…");
  const form = new FormData();
  form.append("file", new Blob([vtt], { type: "text/vtt" }), "captions.vtt");
  const res = await fetch(
    `${CF}/accounts/${account}/stream/${uid}/captions/en`,
    { method: "PUT", headers: { Authorization: `Bearer ${token}` }, body: form },
  );
  const data: any = await res.json();
  if (!res.ok || !data.success) {
    console.warn(`  ⚠ captions upload failed: ${JSON.stringify(data.errors ?? data)}`);
  } else {
    console.log("  captions attached");
  }
}

function applySql(sql: string, remote: boolean): void {
  const file = join(tmpdir(), `cs-ingest-${Date.now()}.sql`);
  spawnSync("node", ["-e", `require('fs').writeFileSync(${JSON.stringify(file)}, ${JSON.stringify(sql)})`]);
  const args = [
    "wrangler",
    "d1",
    "execute",
    "chirosmarts",
    remote ? "--remote" : "--local",
    `--file=${file}`,
  ];
  console.log(`→ applying SQL to D1 (${remote ? "remote" : "local"})…`);
  const r = spawnSync("npx", args, { stdio: "inherit" });
  if (r.status !== 0) fail("wrangler d1 execute failed");
}

async function main() {
  const lessonId = arg("lesson") || fail("--lesson <lessonId> is required");
  const transcriptPath = arg("transcript");
  const videoPath = arg("video");
  const attachUid = arg("attach-uid");
  const name = arg("name") || lessonId;
  const remote = hasFlag("remote");
  const dryRun = hasFlag("dry-run");

  if (videoPath && attachUid) {
    fail("provide either --video (upload a file) or --attach-uid (existing Stream video), not both");
  }

  let chunks: TranscriptChunk[] = [];
  if (transcriptPath) {
    const raw = await readFile(transcriptPath, "utf8");
    chunks = parseTranscript(raw);
    console.log(`✓ parsed ${chunks.length} transcript chunks from ${transcriptPath}`);
    if (chunks.length) {
      console.log(
        `  first: [${chunks[0].startSeconds}s] ${chunks[0].text.slice(0, 60)}…`,
      );
    }
  }

  if (dryRun) {
    console.log("\n--- DRY RUN (no upload, no DB writes) ---");
    if (chunks.length) {
      console.log("\nSQL that would be applied:\n");
      console.log(buildTranscriptSql(lessonId, chunks));
    }
    if (videoPath) console.log(`\nWould upload video: ${videoPath}`);
    if (attachUid) console.log(`\nWould attach existing Stream uid: ${attachUid} (duration read live from Stream)`);
    return;
  }

  const env = await loadEnv();

  let uid: string | null = null;
  let duration: number | null = null;
  if (videoPath) {
    uid = await uploadVideo(env, videoPath, name);
    duration = await waitForReady(env, uid);
    if (chunks.length) await attachCaptions(env, uid, chunksToVtt(chunks));
  } else if (attachUid) {
    uid = attachUid;
    // Video is already in Stream — a single status read returns its true duration.
    duration = await waitForReady(env, uid);
    if (!duration || duration <= 0) {
      fail(`Stream reports a 0s duration for ${uid} — is the video finished processing? A real duration is required for the seat-time gate.`);
    }
    if (chunks.length) await attachCaptions(env, uid, chunksToVtt(chunks));
  }

  // Build the registration + ingest SQL.
  const parts: string[] = [];
  if (uid != null) {
    const setDuration =
      duration != null ? `, duration_seconds = ${duration}` : "";
    parts.push(
      `UPDATE lessons SET stream_video_uid = ${sqlString(uid)}${setDuration} WHERE id = ${sqlString(lessonId)};`,
    );
  }
  if (chunks.length) parts.push(buildTranscriptSql(lessonId, chunks));

  if (parts.length === 0) fail("nothing to do (provide --video and/or --transcript)");
  applySql(parts.join("\n"), remote);

  console.log("\n✓ done.");
  if (uid) console.log(`  lesson ${lessonId} → stream uid ${uid} (${duration}s)`);
  if (chunks.length) console.log(`  ingested ${chunks.length} transcript chunks`);
}

main().catch((e) => fail(e?.message ?? String(e)));
