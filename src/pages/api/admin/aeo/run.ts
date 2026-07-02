/**
 * Admin: run an on-demand AEO citation-presence audit. Queries the configured
 * answer engines (with keys present) for jeldon.config's query set, parses brand
 * citations, and upserts today's snapshot into D1. Makes paid external API calls
 * — on-demand only, never on deploy. Access enforced in middleware (site_admin).
 *
 * The audit fans out several slow online-search LLM calls (queries × engines),
 * which can exceed Cloudflare's ~100s edge timeout and return a 524 to the
 * browser. So we run it in the BACKGROUND via ctx.waitUntil and return
 * immediately; the snapshot appears on the page a minute or two later. In dev
 * (no ctx) we run inline, where there's no edge timeout to worry about.
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

export const POST: APIRoute = async ({ locals, redirect }) => {
  const env = locals.runtime.env;
  const back = "/admin/aeo";

  const keys = engineKeysFromEnv(env as unknown as Record<string, string | undefined>);
  const engines = enginesFromPack(jeldonConfig.aeo, keys);
  if (engines.length === 0) {
    return redirect(`${back}?msg=No+engine+API+keys+set+%E2%80%94+add+PERPLEXITY_API_KEY+or+ANTHROPIC_API_KEY`, 303);
  }

  // The full audit: run every query against every engine, then persist the
  // snapshot. Self-contained so it can run either inline (dev) or backgrounded.
  const runAndStore = async (): Promise<void> => {
    const db = getDb(env);
    const max = jeldonConfig.aeo.maxSnapshots ?? 52;
    const brand = brandMatchFromPack(jeldonConfig);
    const snapshot = await runAudit(jeldonConfig.aeo.querySet, engines, {
      brand,
      timezone: jeldonConfig.content.timezone,
    });
    const store = new D1SnapshotStore(db, max);
    const current = await store.read();
    await store.write(upsertSnapshot({ ...current, maxSnapshots: max }, snapshot));
    await logEvent(db, {
      type: "aeo_audit_complete",
      payload: { queryCount: snapshot.queryCount, engines: engines.map((e) => e.name) },
    }).catch(() => {});
  };

  const ctx = locals.runtime.ctx;
  const names = engines.map((e) => e.name).join(", ");

  // Production: fire-and-forget in the background so the browser doesn't wait
  // (and hit a 524). The page shows the new snapshot once it lands.
  if (ctx?.waitUntil) {
    ctx.waitUntil(
      runAndStore().catch(async (err) => {
        await logEvent(getDb(env), {
          type: "aeo_audit_error",
          payload: { message: err instanceof Error ? err.message.slice(0, 300) : "error" },
        }).catch(() => {});
      }),
    );
    return redirect(
      `${back}?msg=${encodeURIComponent(
        `Audit started in the background (${jeldonConfig.aeo.querySet.length} queries × ${names}). Refresh this page in a minute or two to see the results.`,
      )}`,
      303,
    );
  }

  // Dev fallback: no execution context → run inline (no edge timeout locally).
  try {
    await runAndStore();
    return redirect(
      `${back}?msg=${encodeURIComponent(`Audit complete — ${jeldonConfig.aeo.querySet.length} queries × ${names}`)}`,
      303,
    );
  } catch (err) {
    const detail = err instanceof Error ? err.message.slice(0, 200) : "error";
    return redirect(`${back}?msg=${encodeURIComponent("Audit failed — " + detail)}`, 303);
  }
};
