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
| `RESEND_API_KEY` | secret | Transactional + compliance email (magic links). If empty, sign-in links print to the dev console + login page so you can test without a key. |
| `EMAIL_FROM` | var | From address for transactional email (default `onboarding@resend.dev` for Resend testing). |
| `STRIPE_SECRET_KEY` / `STRIPE_WEBHOOK_SECRET` | secret | Payments (M3). Test mode throughout the build. |
| `CF_ACCOUNT_ID`, `CF_STREAM_API_TOKEN`, `CF_STREAM_SIGNING_KEY_ID`, `CF_STREAM_SIGNING_KEY_PEM` | secret | Cloudflare Stream upload + signed playback (M2). |
| `ANTHROPIC_API_KEY` | secret | AI course tutor (M6 only). |

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

## Cloudflare setup (run these once, then paste IDs into `wrangler.toml`)

These commands require `wrangler login`. They create the resources this app
binds to. (The build runs without them; they're needed to deploy and to use
remote D1/R2/Stream.)

```bash
# Authenticate
npx wrangler login

# D1 database — copy the printed database_id into wrangler.toml ([[d1_databases]].database_id)
npx wrangler d1 create chirosmarts

# R2 bucket for documents (cert PDFs, signed hands-on logs)
npx wrangler r2 bucket create chirosmarts-docs

# Apply schema to the remote D1 and seed it
npm run db:migrate:remote
npm run db:seed:remote

# Cloudflare Stream: enable it in the dashboard. Create an API token with
# Stream:Edit, and a signing key for signed playback URLs. Put the values in
# your deployed secrets (below). Stream is accessed via API, not a binding.
```

### Deploy to the pages.dev subdomain

```bash
# Build + deploy (creates the Pages project on first run)
npm run deploy

# Set deployed secrets (repeat per secret; do NOT put these in wrangler.toml)
npx wrangler pages secret put RESEND_API_KEY
npx wrangler pages secret put STRIPE_SECRET_KEY
# ...etc for each secret in .dev.vars.example

# Set the deployed SITE_URL to the assigned subdomain, e.g.
#   https://chirosmarts-site.pages.dev
# (update wrangler.toml [vars].SITE_URL or set it as a Pages env var)
```

The custom domain attaches at launch; until then everything targets the
auto-generated `*.pages.dev` URL via `SITE_URL`.

## Useful scripts

| Command | Description |
|---|---|
| `npm run dev` | Local dev server (with CF bindings). |
| `npm run build` | Production build. |
| `npm run deploy` | Build + deploy to Cloudflare Pages. |
| `npm run db:generate` | Generate a migration from the Drizzle schema. |
| `npm run db:migrate:local` / `:remote` | Apply migrations. |
| `npm run db:seed:local` / `:remote` | Load sample data from `scripts/seed.sql`. |
