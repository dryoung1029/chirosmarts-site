/**
 * Admin: run an on-demand AEO citation-presence audit. Queries the configured
 * answer engines (with keys present) for jeldon.config's query set, parses brand
 * citations, and upserts today's snapshot into D1. Makes paid external API calls
 * — on-demand only, never on deploy. Access enforced in middleware (site_admin).
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

export const POST: APIRoute = async ({ locals, redirect }) => {
  const env = locals.runtime.env;
  const back = "/admin/aeo";

  const keys = engineKeysFromEnv(env as unknown as Record<string, string | undefined>);
  const engines = enginesFromPack(jeldonConfig.aeo, keys);
  if (engines.length === 0) {
    return redirect(`${back}?msg=No+engine+API+keys+set+%E2%80%94+add+PERPLEXITY_API_KEY+or+ANTHROPIC_API_KEY`, 303);
  }

  try {
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
    const names = engines.map((e) => e.name).join(", ");
    return redirect(
      `${back}?msg=${encodeURIComponent(`Audit complete — ${snapshot.queryCount} queries × ${names}`)}`,
      303,
    );
  } catch (err) {
    const detail = err instanceof Error ? err.message.slice(0, 200) : "error";
    return redirect(`${back}?msg=${encodeURIComponent("Audit failed — " + detail)}`, 303);
  }
};
