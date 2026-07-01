# ChiroSmarts Go-Live Runbook

Everything needed to switch the new platform on. Grouped by **who** does it.
✅ = ready · ⛔ = blocker · ⚠️ = decision needed.

---

## A. Owner actions in external dashboards (only you can do these)

### A1 ⛔ Custom domain
- Attach `chirosmarts.com` to the **chirosmarts-site** Pages project (Pages → Custom domains).
- Point DNS (CNAME/apex) per Cloudflare's instructions.
- Set **`SITE_URL=https://chirosmarts.com`** in the Pages env (and `www` redirect if wanted).
- ⚠️ `SITE_URL` and the domain must flip together — magic links, Stripe redirects, and
  cert-verification URLs all read `SITE_URL`. Don't set it to the custom domain before DNS resolves.

### A2 ⛔ Stripe → LIVE mode
Payments were in **test mode** the entire build. To take real money:
- In Stripe (live mode): grab the **live secret key** (`sk_live_…`).
- Add a **live webhook** → `https://chirosmarts.com/api/stripe/webhook`, events:
  `checkout.session.completed`, `charge.refunded`. Copy its **signing secret** (`whsec_…`).
- Set in Pages secrets: `STRIPE_SECRET_KEY` (live) and `STRIPE_WEBHOOK_SECRET` (live).
- Test with one real card (refund yourself after) — confirm receipt + access + ledger row.

### A3 ⛔ Resend domain verification (email deliverability)
Magic-link login + all lifecycle emails go via Resend. If the domain isn't verified they spam-filter.
- Verify `chirosmarts.com` in Resend (SPF + DKIM + DMARC records).
- Set **`EMAIL_FROM="ChiroSmarts <noreply@chirosmarts.com>"`** and `EMAIL_REPLY_TO="contact@chirosmarts.com"`.

### A4 ✅ Cron worker (flows) — confirm
- `chirosmarts-cron` deployed, `CRON_SECRET` set on the Worker **and** in Pages. (Done — verify one tick returns `ok:true`.)

### A5 Secrets audit — confirm all set in Pages (redeploy after any change)
`SITE_URL`, `RESEND_API_KEY`, `EMAIL_FROM`, `EMAIL_REPLY_TO`, `STRIPE_SECRET_KEY` (live),
`STRIPE_WEBHOOK_SECRET` (live), `CRON_SECRET`, `CONTACT_TOKEN_SECRET`, `ANTHROPIC_API_KEY`,
`CF_WEB_ANALYTICS_TOKEN`, Stream keys (`CF_ACCOUNT_ID`, `CF_STREAM_*`), Brevo keys
(`BREVO_API_KEY`, `BREVO_LIST_ID_*`), `GEMINI_API_KEY` (blog images, optional).

---

## B. Content / legal (in the repo — I can do these fast)

### B1 ✅ Legal effective date + venue — DONE
- Effective date **July 1, 2026**, versions **2026-07-01**, venue **Benton County, OR**;
  all `[EFFECTIVE DATE]`/`[CONFIRM VENUE]` placeholders removed.

### B2 ✅ Renewal CTAs softened — DONE
- The renewal reminder email + birth-month success page no longer push the draft $89 Renewal Pack.
  They now say CE is available for renewal and link to `/renewal`. Re-add the purchase CTA when the
  bundle is published.

### B3 ⚠️ Instructor photo (nulled to avoid a broken image)
- The photo file was missing, so I set `marketing.ts` `instructor.photo` to `null` (clean fallback).
- **To show your headshot (recommended):** add `public/instructor/jason-young.jpg` and change
  `photo` back to `"/instructor/jason-young.jpg"`.

### B4 ✅ Marketing stats / testimonials — intentionally empty
- Per your "only real numbers ship" rule, stats stay blank and testimonials populate from the
  review flow. No action.

---

## C. Data (D1 — you run, I verify)

- **Migrations applied?** `0022` (certified/completed_at) + `0023` (buyer_name). Confirm with
  `npx wrangler d1 migrations list chirosmarts --remote`.
- **Re-import the paid CSV** → backfills buyer names on the ledger.
- **Import the two gradebook CSVs** → marks certified completers (powers the renewal segment).

---

## D. Marketing campaign (ready to fire once live)

- Import the segment CSVs into Brevo, map `Renewal setup URL → RENEWAL_URL` (see
  `docs/marketing/re-permission-emails.md`).
- Send order: **Past buyers first** (small batch, check bounces) → Certified/Need-month → prospects.
- Reminder to non-openers ~4 days later. Copy + Brevo checklist in the emails doc.

---

## E. Post-launch smoke test (10 minutes after go-live)

1. Visit `https://chirosmarts.com` — homepage, `/courses`, `/blog`, `/renewal` load.
2. Request a magic link → arrives in inbox (not spam), logs you in.
3. Buy the initial cert with a real card → receipt email + course access + a ledger row appears.
4. Complete a lesson → seat time accrues; finish → certificate issues + verify link works.
5. `curl ".../api/cron/flows?..."` via the Worker → `ok:true`.
6. `/renewal/my-month?e=…&t=…` (grab a link from the contacts CSV) → sets a month, shows the deadline.
7. **SEO:** open `https://chirosmarts.com/robots.txt` and `/sitemap.xml` — both now build from
   `SITE_URL`, so every URL should read `chirosmarts.com` (no `pages.dev`). Then in **Google Search
   Console**, add the `chirosmarts.com` property and **submit the sitemap** (`/sitemap.xml`).
8. **Legacy 301s — already built in.** The old WordPress URLs (from its Yoast sitemap) 301 to the new
   equivalents via `src/lib/legacy-redirects.ts` (handled in middleware). Spot-check a couple once live,
   e.g. `…/course/ca-initial-certification-or-renewal-8-hour-ceus-with-certificate/` → `/courses/oregon-ca-initial`,
   and `…/my-account/` → `/dashboard`. If Search Console later surfaces other old URLs, add them to that map.
