# ChiroSmarts cron Worker

Cloudflare Pages has no native cron, so this tiny standalone Worker fires once a
day and pings the Pages app's flow endpoint (`/api/cron/flows`), which sends the
day's **welcome / review / renewal** emails. It holds no business logic — all the
flow logic lives in the Pages app.

## One-time setup

From this `cron-worker/` directory:

```bash
# 1. Deploy the Worker (creates the cron trigger).
npx wrangler deploy

# 2. Give it the shared secret — use the SAME value you set as CRON_SECRET in the
#    Pages project (Workers & Pages → chirosmarts-site → Settings → Variables).
npx wrangler secret put CRON_SECRET
```

That's it — it now runs daily at **16:00 UTC (9am Pacific)**. Change the time in
`wrangler.toml` (`crons`) if you like.

## Don't forget the Pages side

In the **Pages** project env, set (then redeploy Pages so they take effect):

- `CRON_SECRET` — same value as the Worker secret above
- `CONTACT_TOKEN_SECRET` — any long random string (signs the birth-month-capture links)
- *(optional)* `GOOGLE_REVIEW_URL` — enables the Google-review nudge on `/review`

## Testing without waiting a day

```bash
# Trigger a run on demand (returns the flow result JSON):
curl "https://chirosmarts-cron.<your-subdomain>.workers.dev/?key=YOUR_CRON_SECRET"

# Or simulate the scheduled event locally:
npm run test:scheduled   # then hit the printed /__scheduled URL
```

The flow engine is idempotent (every send is logged and never repeated), so
running it more than once is safe.
