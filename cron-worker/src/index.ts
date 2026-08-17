/**
 * ChiroSmarts cron Worker — Cloudflare Pages has no native cron, so this tiny
 * standalone Worker fires on a schedule and pings the Pages app's flow tick
 * endpoint, which sends the day's welcome / review / renewal emails.
 *
 * Deploy from this directory:  npx wrangler deploy
 * Then set the shared secret:  npx wrangler secret put CRON_SECRET
 * (use the SAME value you set as CRON_SECRET in the Pages project).
 */
export interface Env {
  TARGET_URL: string; // the Pages site, e.g. https://chirosmarts-site.pages.dev
  CRON_SECRET: string; // shared secret, must match the Pages env var
}

async function runTick(env: Env): Promise<{ status: number; body: string }> {
  const base = (env.TARGET_URL || "").replace(/\/$/, "");
  const res = await fetch(`${base}/api/cron/flows`, {
    headers: { "x-cron-key": env.CRON_SECRET },
  });
  return { status: res.status, body: await res.text() };
}

export default {
  // Daily scheduled run (see crons in wrangler.toml).
  async scheduled(_event: ScheduledEvent, env: Env, ctx: ExecutionContext): Promise<void> {
    ctx.waitUntil(
      runTick(env).then((r) => console.log(`[cron] flows ${r.status}: ${r.body.slice(0, 300)}`)),
    );
  },

  // GET with ?key=<CRON_SECRET> triggers a run on demand (handy for testing);
  // any other request is a plain health check.
  async fetch(req: Request, env: Env): Promise<Response> {
    const url = new URL(req.url);
    if (url.searchParams.get("key") !== env.CRON_SECRET) {
      return new Response("chirosmarts-cron: ok", { status: 200 });
    }
    const r = await runTick(env);
    return new Response(r.body, { status: r.status, headers: { "content-type": "application/json" } });
  },
};
