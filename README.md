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
| `ADMIN_EMAILS` | wrangler `[vars]` / `.dev.vars` | Comma-separated emails granted the admin area (`/admin`). Matching accounts are promoted to `site_admin` on login. |
| `RESEND_API_KEY` | secret | Transactional + compliance email (magic links). If empty, sign-in links print to the dev console + login page so you can test without a key. |
| `EMAIL_FROM` | var | From address for transactional email (default `onboarding@resend.dev` for Resend testing). |
| `STRIPE_SECRET_KEY` / `STRIPE_WEBHOOK_SECRET` | secret | Payments (M3). Test mode throughout the build. |
| `CF_ACCOUNT_ID`, `CF_STREAM_API_TOKEN`, `CF_STREAM_SIGNING_KEY_ID`, `CF_STREAM_SIGNING_KEY_PEM` | secret | Cloudflare Stream upload + signed playback (M2). |
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
