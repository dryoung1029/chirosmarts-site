/**
 * Admin: run an on-demand AEO citation-presence audit. Queries the configured
 * answer engines (with keys present) for jeldon.config's query set, parses brand
 * citations, and upserts today's snapshot into D1. Paid external API calls —
 * on-demand only. Access enforced in middleware (site_admin).
 *
 * Reliability: runs INLINE (no ctx.waitUntil background — that wasn't reliably
 * completing on Pages, which showed up as "timeout"). To stay well under
 * Cloudflare's request limit, the queries run CONCURRENTLY and each engine call
 * is bounded by a timeout, so one slow/hung provider can't stall the audit. A
 * failed engine becomes an "err" cell rather than a hang.
 */
import type { APIRoute } from "astro";
import {
  runAudit,
  upsertSnapshot,
  brandMatchFromPack,
  enginesFromPack,
  engineKeysFromEnv,
} from "@jeldon/aeo-audit";
import { getDb } from "@/db/client";
import { jeldonConfig } from "@/lib/jeldon";
import { D1SnapshotStore } from "@/lib/aeo";
import { logEvent } from "@/lib/events";

const ENGINE_TIMEOUT_MS = 40_000;
// Run at most this many queries at once. Firing all queries simultaneously
// bursts the providers (each query hits every engine), which rate-limits
// Anthropic and trips the per-engine timeout on the slower queries. A small
// concurrency keeps calls flowing without the burst — and 2 batches of a 40s
// cap stays comfortably under Cloudflare's request limit for the inline run.
const QUERY_CONCURRENCY = 3;

/** Map with bounded concurrency, preserving input order. */
async function mapLimit<T, R>(items: T[], limit: number, fn: (item: T) => Promise<R>): Promise<R[]> {
  const results = new Array<R>(items.length);
  let next = 0;
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (next < items.length) {
      const idx = next++;
      results[idx] = await fn(items[idx]);
    }
  });
  await Promise.all(workers);
  return results;
}

export const POST: APIRoute = async ({ locals, redirect }) => {
  const env = locals.runtime.env;
  const back = "/admin/aeo";

  const keys = engineKeysFromEnv(env as unknown as Record<string, string | undefined>);
  const rawEngines = enginesFromPack(jeldonConfig.aeo, keys);
  if (rawEngines.length === 0) {
    return redirect(`${back}?msg=No+engine+API+keys+set+%E2%80%94+add+PERPLEXITY_API_KEY+or+ANTHROPIC_API_KEY`, 303);
  }

  // Bound each engine call: one slow/hung provider can't stall the whole audit,
  // and the total stays comfortably under Cloudflare's request limit.
  const engines = rawEngines.map((e) => ({
    name: e.name,
    fn: (q: string) =>
      Promise.race([
        e.fn(q),
        new Promise<never>((_, reject) =>
          setTimeout(() => reject(new Error(`${e.name} timed out after ${ENGINE_TIMEOUT_MS / 1000}s`)), ENGINE_TIMEOUT_MS),
        ),
      ]),
  }));

  const db = getDb(env);
  const names = engines.map((e) => e.name).join(", ");

  try {
    const max = jeldonConfig.aeo.maxSnapshots ?? 52;
    const brand = brandMatchFromPack(jeldonConfig);
    const querySet = jeldonConfig.aeo.querySet;

    // Queries run a few at a time (each still fans out to its engines in
    // parallel); merged into one snapshot. Shared `now` keeps a single date key.
    const opts = { brand, timezone: jeldonConfig.content.timezone, now: new Date() };
    const perQuery = await mapLimit(querySet, QUERY_CONCURRENCY, (q) =>
      runAudit([q], engines, opts),
    );
    if (perQuery.length === 0) {
      return redirect(`${back}?msg=No+queries+configured`, 303);
    }
    const snapshot = {
      ...perQuery[0],
      engines: engines.map((e) => e.name),
      queryCount: querySet.length,
      results: perQuery.flatMap((s) => s.results),
    };

    const store = new D1SnapshotStore(db, max);
    const current = await store.read();
    await store.write(upsertSnapshot({ ...current, maxSnapshots: max }, snapshot));

    // Tally engine errors so the result message flags them (the grid shows which).
    let errCells = 0;
    for (const r of snapshot.results) {
      for (const cell of Object.values(r.engines as Record<string, { error?: string }>)) {
        if (cell?.error) errCells++;
      }
    }
    await logEvent(db, {
      type: "aeo_audit_complete",
      payload: { queryCount: snapshot.queryCount, engines: engines.map((e) => e.name), errCells },
    }).catch(() => {});

    const note = errCells
      ? ` — but ${errCells} engine call(s) errored (hover the “err” cells to see why)`
      : "";
    return redirect(
      `${back}?msg=${encodeURIComponent(`Audit complete — ${querySet.length} queries × ${names}${note}`)}`,
      303,
    );
  } catch (e) {
    const detail = e instanceof Error ? e.message.slice(0, 300) : "error";
    await logEvent(db, { type: "aeo_audit_error", payload: { message: detail } }).catch(() => {});
    return redirect(`${back}?msg=${encodeURIComponent("Audit failed — " + detail)}`, 303);
  }
};
