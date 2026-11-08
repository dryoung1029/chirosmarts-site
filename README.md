# ChiroSmarts

Continuing-education & compliance platform for Oregon Chiropractic Assistant (CA)
training. Astro 5 (SSR) on Cloudflare (D1 / R2 / Stream), Stripe, Resend.

- **Project plan & status:** [`PLAN.md`](./PLAN.md)
- **Rules for contributors / AI sessions:** [`CLAUDE.md`](./CLAUDE.md)

Current milestone: **M1 — Auth + intake + roadmap**.


---

## Prerequisites

- Node 20+ (developed on Node 22)
- A Cloudflare account (for deployment / remote D1, R2, Stream)
- `npm install`

## Local development

```bash
# 1. Install deps
npm install

# 2. Create your local secrets file (git-ignored) and fill it in
cp .dev.vars.example .dev.vars

# 3. Create the local D1 database tables and seed sample data
npm run db:migrate:local
npm run db:seed:local

# 4. Run the dev server
npm run dev
```

Then open:

- <http://localhost:4322/> — the scaffold "hello" page (shows the `SITE_URL`
  it read from the environment).
- <http://localhost:4322/health> — JSON liveness check. Should return
  `{"ok": true, ... "db": "ok"}` once the local DB is migrated.
- <http://localhost:4322/login> — sign in. With no `RESEND_API_KEY` set, submit
  your email and the one-time sign-in link appears on the page (and in the dev
  console) instead of being emailed. Click it → fill in intake → see your
  roadmap at `/dashboard`.

> The dev server uses Cloudflare's platform proxy, so the D1/R2 bindings and
> the values in `.dev.vars` are available exactly as they will be in production.

## Environment variables

Public, non-secret vars live in `wrangler.toml` (`[vars]`). Secrets live in
`.dev.vars` locally (never committed) and in Cloudflare for deployment. See
[`.dev.vars.example`](./.dev.vars.example) for the full list. Summary:

| Variable | Where | Purpose |
|---|---|---|
| `SITE_URL` | wrangler `[vars]` / `.dev.vars` | Public site URL for magic links, Stripe redirects, cert verification. **Never hard-code URLs.** |
| `ADMIN_EMAILS` | wrangler `[vars]` / `.dev.vars` | Comma-separated emails granted the admin area (`/admin`). **The only source of admin access**: removing an address revokes it on the next request, and the stored `site_admin` role is re-synced at sign-in. (Only if this is empty does the stored role count, so a missing var can't lock you out.) |
| `RESEND_API_KEY` | secret | Transactional + compliance email (magic links). If empty, sign-in links print to the dev console + login page so you can test without a key. |
| `EMAIL_FROM` | var | From address for transactional email. **For real delivery, set this to an address on a domain you've verified in Resend** (e.g. `ChiroSmarts <login@mail.chirosmarts.com>`). The default `onboarding@resend.dev` is Resend's shared sandbox and **will be spam-filtered** in real inboxes. |
| `EMAIL_REPLY_TO` | var | Optional reply-to for transactional email (e.g. `support@chirosmarts.com`). Improves trust/deliverability. |
| `STRIPE_SECRET_KEY` / `STRIPE_WEBHOOK_SECRET` | secret | Payments (M3). Test mode throughout the build. |
| `CF_ACCOUNT_ID`, `CF_STREAM_API_TOKEN`, `CF_STREAM_SIGNING_KEY_ID`, `CF_STREAM_SIGNING_KEY_PEM` | secret | Cloudflare Stream upload + signed playback (M2). |
| `CRON_SECRET` | secret (+ GitHub repo secret) | Authorizes `/api/cron/*` and `/health?deep=1`. Sent **only** in the `x-cron-key` header (a `?key=` URL param is no longer accepted). The GitHub workflows `cron` and `smoke` need the same value as a repository secret. |
| `CONTACT_TOKEN_SECRET` | secret | Signs no-login email links: **unsubscribe**, review, and renewal-month. Unset = a fallback key that's in this repo, so links are forgeable; Admin → Overview → Email diagnostics shows which is in use. Set it to any long random string. |
| `ANTHROPIC_API_KEY` | secret | AI course tutor (M6) — Claude Haiku 4.5. Without it the tutor replies "not configured yet"; set it in prod via `wrangler pages secret put ANTHROPIC_API_KEY`. |

Bindings (in `wrangler.toml`): `DB` (D1), `DOCS` (R2).

## Database (D1) workflow

Schema is defined in `src/db/schema.ts` (Drizzle). To change it:

```bash
# 1. Edit src/db/schema.ts
# 2. Generate a new SQL migration into ./migrations
npm run db:generate
# 3. Apply locally, then (after provisioning) remotely
npm run db:migrate:local
npm run db:migrate:remote
```

Migrations are plain SQL in `./migrations` and are applied with Wrangler, so the
exact same SQL runs locally and on Cloudflare.

**Applying production migrations without a terminal:** GitHub → Actions →
**migrate** → Run workflow (works from a phone). It also runs by itself when a
push to `main` changes `migrations/`. One-time setup: add repository secrets
`CLOUDFLARE_ACCOUNT_ID` (the account that owns the `chirosmarts` D1) and
`CLOUDFLARE_API_TOKEN` (permission: Account → D1 → Edit).

**Knowing a deploy actually worked:** the **smoke** workflow runs after every
push to `main` (and daily). It waits until `/health` reports that commit, checks
the public pages and security headers, then calls `/health?deep=1`, which compares
the live database with this build's schema and migrations and names any missing
table, column or migration. A red **smoke** run means look at Cloudflare Pages
deployments or run **migrate**.

Tests: `npm test`. Database tests run against a real SQLite file with every
migration applied (`src/test/sqlite-db.ts`, Node 22+).

## Abuse protection (rate limits)

Public endpoints that send email or spend money are throttled in code
(`src/lib/rate-limit.ts`, table `rate_limits`): per network, generous enough
for a CE room on one Wi-Fi, plus per address (5 sign-in links/hour, 10-minute
resend cooldown on signup confirmations, 3 help-form messages/hour). It fails
open if storage is unavailable.

For a second layer at the edge, add one Cloudflare rate-limiting rule on the
`chirosmarts.com` zone (Security → WAF → Rate limiting rules; the free plan
allows one) covering only the three endpoints that send email, so video
heartbeats, quizzes and Stripe are never affected: match
`http.request.method eq "POST" and http.request.uri.path in {"/api/auth/request-link" "/api/leads/capture" "/api/help/contact"}`,
**20 requests per 10 seconds per IP**, action **Block** for 10 seconds.

## Cloudflare setup + deploy

### One-shot (recommended)

`scripts/cloudflare-setup.sh` provisions everything (D1, R2, and the KV
namespace the Astro adapter requires), writes the resulting IDs into
`wrangler.toml`, runs the remote migrations, builds, and deploys. It is
idempotent — re-running reuses existing resources.

```bash
# Authenticate interactively…
npx wrangler login
CLOUDFLARE_ACCOUNT_ID=<your-account-id> bash scripts/cloudflare-setup.sh

# …or non-interactively with an API token (account scopes: D1:Edit,
# Workers KV Storage:Edit, Workers R2 Storage:Edit, Cloudflare Pages:Edit,
# Account Settings:Read):
CLOUDFLARE_API_TOKEN=<token> CLOUDFLARE_ACCOUNT_ID=<id> bash scripts/cloudflare-setup.sh
```

Resource IDs (`database_id`, KV `id`) are **not secrets** and are committed in
`wrangler.toml`. API keys are **never** committed — set them as deployed secrets:

```bash
npx wrangler pages secret put RESEND_API_KEY --project-name chirosmarts-site
npx wrangler pages secret put STRIPE_SECRET_KEY --project-name chirosmarts-site
# …one per secret in .dev.vars.example. With no RESEND_API_KEY, sign-in links
# are written to the Worker log (view with: wrangler pages deployment tail).

# Seed the demo catalog on the remote DB if you want the course live:
npm run db:seed:remote
```

### Manual equivalents

```bash
npx wrangler d1 create chirosmarts            # → paste database_id into wrangler.toml
npx wrangler kv namespace create SESSION      # → paste id into wrangler.toml (adapter needs it)
npx wrangler r2 bucket create chirosmarts-docs
npm run db:migrate:remote
npm run deploy                                # build + wrangler pages deploy ./dist
```

`SITE_URL` in `wrangler.toml` is the production value
(`https://chirosmarts-site.pages.dev`); local `astro dev` overrides it via
`.dev.vars`. The custom domain attaches at launch; until then everything targets
the auto-generated `*.pages.dev` URL. **Cloudflare Stream** (signed playback) is
accessed via API, not a binding — create a Stream API token + signing key and
add them as deployed secrets when you upload the first videos (M2 player works
with the dev simulator until then).

## Useful scripts

| Command | Description |
|---|---|
| `npm run dev` | Local dev server (with CF bindings). |
| `npm run build` | Production build. |
| `npm run deploy` | Build + deploy to Cloudflare Pages. |
| `npm run db:generate` | Generate a migration from the Drizzle schema. |
| `npm run db:migrate:local` / `:remote` | Apply migrations. |
| `npm run db:seed:local` / `:remote` | Load sample data from `scripts/seed.sql`. |
