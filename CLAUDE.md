# CLAUDE.md — ChiroSmarts working rules for AI sessions

This file keeps future sessions aligned. Read it before making changes.
The authoritative project state (current milestone, decisions, open questions)
lives in **PLAN.md** — update it every session.

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
   cannot unlock until credited content-minutes ≥ `credit_hours × 60`.
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
