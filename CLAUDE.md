# CLAUDE.md — ChiroSmarts working rules for AI sessions

This file keeps future sessions aligned. Read it before making changes.
The authoritative project state (current milestone, decisions, open questions)
lives in **PLAN.md** — update it every session.

## Session handoff — current state & next task (2026-06, read first)

**DEPLOY / PRODUCTION BRANCH (read first):** Cloudflare Pages is **Git-connected**
and its **production branch is `main`** — pushing to `main` **auto-builds and
deploys** to `https://chirosmarts-site.pages.dev` (no manual `wrangler pages
deploy` needed). `main` was historically stuck at an old commit while work lived
on `claude/blissful-archimedes-60fn4w` / `claude/charming-faraday-ixrhmb`, which
is why deploys silently lagged; **as of 2026-06 `main` is the source of truth —
merge/fast-forward your work into `main` to ship.** (Older notes referencing
`blissful-archimedes` as prod are superseded.)

**Shipped & live** (prod: `https://chirosmarts-site.pages.dev`, production branch
**`main`**): M0–M6 complete, plus **multi-course Phases
1–3** (catalog, course landing, `course_resources`, `requiredSeatMinutes` exam
gate, bundle fulfilment), **pricing model** (DB-only prices, `bundle_items`),
**legal pages** (`/terms`,`/privacy` from `src/content/legal/*.md` — real draft
text + entity values in; **effective date + `[VERIFY]` flags pending owner**),
**marketing storefront + funnel** (homepage w/ animated hero demo, course pages,
`/clinics`, `/renewal` + renewal-date checker, `/about`, guides system, lead
capture w/ **double opt-in**, Brevo groundwork), **light design-token theme**
(`src/styles/tokens.css` — single source, no raw hexes), and a **semantic tutor**
(Workers AI `bge-small` embeddings in `transcript_embeddings`, cosine in-JS,
hybrid w/ keyword; all prod transcripts embedded). PLAN.md has the full registry,
the `[VERIFY]` launch-blockers, and the owner-placeholder list.

**IN-FLIGHT NEXT TASK — illustration integration (NOT started):** 15 real
illustrations are committed at `src/assets/illustrations/illustration-NN-*.png`
(4–5 MB each). Requirements: (1) serve every one through Astro's image pipeline
(`astro:assets` `<Picture>`, AVIF/WebP, responsive srcset, explicit w/h — never
raw PNGs); (2) placement map → audience cards 02–04, course pages 05–07,
how-it-works/emails 08–09, empty states 10, clinics 11, guide headers 12, 404 14;
(3) all DECORATIVE (`alt=""`, aria-hidden, never replace text); (4) lazy-load
below fold, keep homepage Lighthouse ≥90 (downscale + note in PLAN if it drops);
(5) build `public/og-default.png` (1200×630) = wordmark over illustration-13
(text in left negative space), update OG meta, retire `og-default.svg`; (6) use
09 (renewal) + 07 (certificate) in the Resend email templates as **hosted absolute
`SITE_URL` images** (downscale to ~600px PNG in `public/email/` — email clients
don't do WebP/AVIF); (7) native aspect ratio, pad with `#FAFAF7` (or transparent)
rather than crop/stretch; list unfilled slots in PLAN. Recon done: **sharp is
installed**; **no image service configured** → add `imageService: 'compile'` to
the Cloudflare adapter so static imports optimize at build (runtime passthrough);
illustrations **01 (roadmap)** and **15 (patient-checkin)** have NO slot in the
map (extras — note them). ARs: 02–04,06,07,10 square; 05,08 ≈1.49; 09,11,12,14
≈2.0; 13 ≈1.79; 15 ≈1.83.

**Also pending:** Phase 4 per-course clinic seat pools — concrete DDL ready for
review at `docs/phase4-seat-pools-ddl.md` (approved design in PLAN.md), not built.

**Ops gotchas:** deploy with `wrangler pages deploy ./dist`; **Pages applies env
var / secret / binding changes only on the NEXT deploy**. Migrations: edit
`schema.ts` → `npm run db:generate` → `db:migrate:local`/`:remote`; **D1 can't
rebuild a table inside a migration** (FK pragma is a no-op in the txn) — keep
migrations additive (see migration 0006 note). Re-embed the tutor after new
transcripts via **Admin → AI tutor → Embed transcripts**. Git: **`main` is the
Cloudflare production branch (auto-deploys on push)** — merge finished work into
`main` to ship. The owner also pushes from their own clone; pull before pushing,
never force-push, prefer a fresh clone.

## What this is

A continuing-education + compliance platform for ChiroSmarts.com (owner: Dr.
Jason Young, DC). It sells Oregon Chiropractic Assistant (CA) training: a
state-compliant initial certification course and annual renewal CE. **This is a
compliance product — auditability matters more than scale** (25–75 students/yr).

## Stack (fixed — do not relitigate)

- **Astro 5** in **SSR mode**, deployed to **Cloudflare** Pages/Workers.
- **Cloudflare D1** (database), **R2** (documents: cert PDFs, signed logs),
  **Cloudflare Stream** (all course video, signed playback tokens).
- **Stripe Checkout** for payments (test mode throughout the build); webhooks
  for fulfillment.
- **Resend** for ALL transactional + compliance email (magic links, receipts,
  certificates, renewal reminders) and magic-link auth (no passwords).
  **Brevo** (deferred) handles marketing only.
- **TypeScript** throughout. API logic lives in **Astro endpoints/actions** — do
  NOT add a separate API service unless explicitly decided.
- **Drizzle ORM** for schema/migrations/typed queries. Hand-write SQL for the
  seat-time recompute.
- **Sessions:** server-side D1 `sessions` table; opaque token in an HttpOnly,
  Secure, SameSite=Lax cookie. Concurrent logins allowed.

### Dependency policy
Minimal. Approved: Astro Cloudflare adapter, Stripe SDK, Resend SDK, Drizzle
(+ drizzle-kit), zod, pdf-lib (certificates, M4), Anthropic SDK (M6 tutor only).
**Ask the owner before adding anything else.**

### SITE_URL — never hard-code URLs
The public site URL is always read from the `SITE_URL` env var (`src/lib/env.ts`
→ `getSiteUrl()`). Used for magic-link emails, Stripe redirects, and certificate
verification links. Deploy target is the auto-generated `*.pages.dev` subdomain
until the custom domain attaches at launch.

## Compliance requirements (non-negotiable)

1. **Seat time = content-minutes, not wall-clock.** Credited minutes per lesson =
   length of the **union of unique video-position coverage**, capped at the
   video duration. Rewatching never double-counts; credit can never exceed
   content length. Heartbeats (~1 per 45s of playback) record
   `position_start`, `position_end`, `wall_seconds`, `playback_rate`, and are
   **append-only**. Heartbeats fire only while playing in a focused tab.
   Playback speed allowed, capped per-course (default 1.5x). The final exam
   unlocks when the student has watched ≥ 90% of EVERY lesson (no-skip rule) AND
   accrued the course's explicit `required_seat_minutes` of content (a per-course
   knob, NULL = no extra floor, clamped to runtime so it's never unsatisfiable).
   **`required_seat_minutes` is decoupled from `credit_hours`** — the latter is
   the certificate figure only, so a course may grant more credit than it has
   video (e.g. Vitals, where credit includes off-video practice logged on paper).
   **Never UPDATE a seat-time total — always recompute from `events`.**
2. **One active playback DEVICE per user** via the short-lived `playback_leases`
   table (NOT session revocation). Heartbeats renew the lease; a stale lease can
   be stolen by another device.
3. **Quiz/exam pass threshold per-course (default 80%).** `quiz_attempts` is the
   **sole, append-only** system of record; failed attempts are retained, never
   overwritten. `events` may hold only a thin pointer to a `quiz_attempts.id`.
4. **Certificates** render legal name, course title, credit hours, completion
   date, instructor (per-course `instructor_name`, default "Jason Young, DC"),
   and a verification code. Values are **snapshotted at issuance**. PDF in R2,
   emailed on issuance, and **publicly verifiable** via the verification code.
5. **All times stored UTC; displayed America/Los_Angeles.**
6. **Compliance data is never auto-deleted** (`events`, `quiz_attempts`,
   `certificates`, `documents`).

## Domain model

See `src/db/schema.ts` (source of truth) and PLAN.md §4 for the full table list.
Key idea: `events` is the append-only audit trail; all derived state (seat time,
completion, certified status, Brevo attributes) is **recomputed**, never stored
as a mutable counter. Deferred-feature enums (subscriptions, library episodes,
live-attendance credit, additional states/paths) exist now so they need no
migration later.

## Milestones (build strictly in order; confirm before moving on)

- **M0 Scaffold** ← (this session) project, schema/migrations, wrangler, seed,
  hello page, SITE_URL wired, CLAUDE.md.
- **M1** Auth + intake + roadmap.
- **M2** Course player + seat time + **transcript ingestion** (`lesson_transcripts`).
- **M3** Quizzes + Stripe (Module 1 free, paywall at Module 2; refund webhook
  revokes enrollment).
- **M4** Certificates + document vault (pdf-lib).
- **M5** Admin (student list, seat-time audit, content mgmt, cert reissue).
- **M6** AI course tutor (Anthropic API, retrieval over `lesson_transcripts`
  ONLY, cites lesson+timestamp with deep links, declines out-of-scope incl.
  clinical advice). Build only after M0–M5 ship.

## Working agreement

- **Product ambiguity (copy, pricing, UX) → ASK.** Technical ambiguity →
  propose 2 options + a recommendation, then ask.
- Small, frequent commits. **Never commit secrets** — local secrets in
  `.dev.vars` (git-ignored); document env vars in README.md.
- Git: `main` holds integrated state; work on named milestone branches
  (`m0-scaffold`, `m1-auth`, …).
- End each working block with a plain-language recap + how to test locally (the
  owner is technical but not a professional developer).
