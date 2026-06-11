# ChiroSmarts Platform — PLAN.md

> Living planning doc. Updated every session so the owner can share project state with his technical advisor.
> **Last updated:** 2026-06-10 — Session 1 (plan approved with adjustments; scaffolding M0)

---

## 1. Current status

| Item | State |
|---|---|
| Current milestone | **M4 — Certificates + verification** (built + deployed). M0–M3 shipped. **M5 — Admin** is next. |
| M0 | ✅ merged to `main` |
| M1 | ✅ fast-forward merged to `main` (was `m1-auth`) |
| M1.5 | ✅ built (clinic-owner path) |
| Plan | **Approved** 2026-06-10 with adjustments (folded in below) |
| Git model | `main` holds approved state; work happens on named milestone branches (`m0-scaffold`, `m1-auth`, `m1.5-clinic`, `m2-player`, …) merged to `main` |

### M4 — what shipped this build (certificates + verification)
- **`src/lib/certificate.ts`**: idempotent issuance with snapshotted legal name / course title / credit hours / instructor / date. Two IDs per cert — `certNumber` human serial (`CS-YYYY-NNNN`, sequential per year) + random unguessable `verificationCode` (public lookup). Legal-name guard: no name on file → issuance deferred until intake completed.
- **PDF (pdf-lib)**: landscape Letter, accent border, **logo wordmark** drawn in-doc, recipient/course/credit/date/instructor, **anti-duplication tiled diagonal watermark** (`CHIROSMARTS · VERIFIED · CS-…`), and a **QR** (drawn from the qrcode module matrix — no PNG dep) linking to the verify page. Stored in R2 (`DOCS`).
- **Issuance hook**: passing the final exam issues + emails the certificate (Resend, PDF attached). Failures never roll back the passing attempt; the course page **self-heals** (lazy idempotent issue) on next visit if a name was added later or issuance errored.
- **Public verification**: `/verify` (code entry) + `/verify/[code]` (valid / revoked / not-found, shows snapshotted values) + `/certificate/[code].pdf` (public PDF by code, revoked withheld). No auth — publicly verifiable by design.
- **Logo**: `src/components/Logo.astro` SVG wordmark (placeholder spine glyph) in the site header + landing page. Swap one file when final art is ready.
- **Schema**: added `certificates.cert_number` (unique) — migration `0003`, applied local + remote.
- **New dep**: `qrcode` (approved). `pdf-lib` (pre-approved) now in use.

### M2 — what shipped this build (course player + seat time + transcripts)
- **`creditedSeconds()` compliance core** (`src/lib/seat-time.ts`): pure, dependency-free union-of-coverage with per-endpoint clamping; rewatch never double-counts, credit capped at duration, reversed/seek-back intervals dropped. **17 unit tests** (vitest). Seat time is always RECOMPUTED from `events`, never stored.
- **Signed Stream playback** (`src/lib/stream.ts`, `POST /api/stream/token`): RS256 JWT minted in-Worker from a Stream signing key — no per-request Stream API call. Entitlement-checked; dev fallback when keys absent.
- **Single-device lease** (`src/lib/playback-lease.ts`, `POST /api/playback/lease`): 90s TTL keyed to `user_id`+`device_id`; heartbeats renew, stale leases are stealable, a live lease on another device returns **409**.
- **Heartbeat** (`POST /api/lessons/[id]/heartbeat`): append-only `lesson_heartbeat` events (typed position/wall/rate columns); lease-guarded; rejects playback rate over the per-course cap (400).
- **Progress + resume** (`src/lib/progress.ts`, `GET /api/lessons/[id]/progress`): recomputed credited seconds, resume position, completion; course-wide sum drives the **final-exam gate** (`credited ≥ credit_hours × 3600`).
- **Player UI**: `/learn/[courseSlug]` overview (enrollment-gated, Module 1 previewable, progress bar + gate state) and the lesson page with a client engine (`public/lesson-player.js`) — heartbeats fire ~every 20s only while playing in a focused tab; seeks/pauses break coverage runs; resume-to-position. Real Cloudflare Stream adapter **plus a local dev simulator** so seat-time is testable without uploading video.
- **Transcript ingestion** (`src/lib/transcript.ts`, **8 unit tests**) + **`scripts/upload-to-stream.ts`**: uploads video to Stream, waits for ready/duration, attaches WebVTT captions, ingests cues into `lesson_transcripts` (one row per cue — M6 prerequisite), and registers the lesson. Has `--dry-run`.
- **Env additions**: `CF_STREAM_CUSTOMER_CODE`, `CF_STREAM_SIGNING_KEY_JWK`. **Dev tooling**: `vitest` (approved), `npm run test`, `npm run stream:upload`.
- **Verified locally** (curl + vitest, port 4322): 25/25 unit tests; heartbeat→recompute with rewatch (no double-count); full coverage → complete; lease 409 across devices; rate-cap 400; exam gate locks at 8h and unlocks at threshold; cross-course lesson URL → redirect; append-only events retained; `astro check` + build clean; upload-to-stream dry-run SQL correct.

### M1.5 — what shipped this build (clinic-owner path)
Owner decisions: **build a real clinic roadmap template**; staff CAs join by **invite-by-email (self-claim)**; seats are a **bulk pool**.
- **Schema delta**: `clinics` (owner, name, `seats_purchased`) + `clinic_members` (owner/CA rows, invite token hash, `invited｜active｜removed`). Migration `0002_clinics.sql`.
- **Clinic roadmap template** `oregon-clinic-owner` seeded (set up clinic → buy seats → invite CAs → track to certification). Intake `clinic_owner` now provisions a clinic + instantiates this path (clinic name required).
- **Invite-by-email**: owner invites a CA → reserves a seat → emails a one-time claim link (`/clinic/join?token=…`). The token proves email ownership, so claiming both authenticates the CA and links membership (same model as a magic link). Dev fallback surfaces the claim link when `RESEND_API_KEY` is unset.
- **Bulk seat pool**: seats consumed = CA members in (`invited｜active`), **recomputed never stored**. `seats_purchased` is the only stored figure. Seat purchase is **comped in test mode** when `STRIPE_SECRET_KEY` is unset (mirrors the email dev fallback); routes to Stripe Checkout in M3.
- **Owner dashboard**: seat summary, buy-seats, invite form (disabled at 0 seats), CA roster with status + per-CA onboarding state, revoke-pending-invite (frees the seat).
- **Append-only events**: `clinic_created`, `clinic_seats_granted`, `clinic_invite_sent`, `clinic_invite_accepted`, `clinic_invite_revoked`.
- **Verified locally** (curl, port 4322): owner intake→clinic, comp seats, invite→claim→roster shows "Joined", seat exhaustion blocked, duplicate-invite blocked, revoke frees a seat. `astro check` clean.
- **Dev tooling added**: `@astrojs/check` + `typescript` (dev-only, for the project's existing `typecheck` script).

### M1 — what shipped this build
- **Magic-link auth** (`/login` → emailed one-time link → `/auth/callback`). Tokens are random, only their SHA-256 hash is stored, single-use, 15-min expiry. Login & signup are the same flow (no account-enumeration). Dev fallback: with no `RESEND_API_KEY`, the link is logged to the console and shown on the login page.
- **D1 sessions** (`cs_session` cookie, HttpOnly/SameSite=Lax, Secure when SITE_URL is https). Concurrent logins allowed; sessions never force-revoked. Session token hashed at rest.
- **Middleware** (`src/middleware.ts`): resolves `locals.user`, guards private routes → `/login`, funnels un-onboarded users → `/intake`.
- **Intake** (`/intake` → `/api/intake`): legal name, preferred name, path choice, birth month, clinic, phone, optional supervising DC, marketing-consent (timestamped). Marketing attributes captured for later Brevo sync; sets `clinic_owner` → `clinic_admin` role.
- **Roadmap instantiation** (`src/lib/roadmap.ts`): snapshots template steps into `user_steps` with a linear gate (step 1 done, step 2 available, rest locked). Initial & renewal paths wired.
- **Dashboard** (`/dashboard`): renders the user's roadmap with per-step status.
- **Append-only events**: `signup`, `login`, `intake_completed` written via `src/lib/events.ts`.
- **Schema delta**: added `users.intake_completed_at`; `legal_name` now defaults to `""` (filled at intake). Migration `0001_add_intake_completed_at.sql`.
- **Verified locally** (curl, port 4322): guard redirect, request-link, callback→session, intake gate, intake submit, dashboard roadmap (initial + renewal), single-use token reuse blocked, logout.

### Resolved — clinic-owner path (was the M1 open question)
Owner chose to **build a real clinic roadmap template** (M1.5, above): clinic owners are `clinic_admin`, get the `oregon-clinic-owner` roadmap, buy a **bulk seat pool**, and invite CAs by **email self-claim**. A CA's certification path is whatever they pick at their own intake (initial); clinic membership is independent of it.

**Build order is strict and one-at-a-time: M0 → M1 → M2 → M3 → M4 → M5 → M6. Confirm before moving between milestones.**

---

## 2. Decisions made

### Locked (kickoff Q&A + approval adjustments)
1. **Data layer: Drizzle ORM** (thin, typed) for schema, migrations, and simple queries. The compliance recompute (unique video-position coverage → credited minutes) is hand-written app code regardless.
2. **Auth sessions: server-side D1 `sessions` table.** Opaque token in an `HttpOnly`/`Secure`/`SameSite=Lax` cookie. **Concurrent logins are allowed; sessions are never force-revoked.**
3. **Single active playback device = short-lived `playback_leases`, NOT session revocation.** Starting playback acquires a lease (~90s TTL) keyed to `user_id` + `device_id`; each heartbeat renews it. A different device can begin playback only after the current lease expires (steals the stale lease). Many sessions, one active playback device at a time.
4. **Cloudflare provisioning: I document, owner runs.** Scaffold ships exact `wrangler`/dashboard steps for D1, R2, Stream, Pages; owner runs them and pastes IDs into config/secrets.
5. **Certificate instructor of record: "Jason Young, DC"**, stored as a per-course field (`instructor_name` + optional `certifying_body_line`).
6. **`quiz_attempts` is the SOLE system of record for quiz data.** `events` must not duplicate quiz answers/scores — at most a thin pointer event (`quiz_attempt`, referencing `quiz_attempts.id`) for the unified timeline.
7. **PDF library: `pdf-lib`** (pure JS, Workers-compatible). Confirmed for M4.
8. **Compliance data is never auto-deleted.** `events`, `quiz_attempts`, `certificates`, `documents` are retained indefinitely (append-only / archival).
9. **Refunds are manual in Stripe.** The app only handles the inbound refund webhook → revokes the affected enrollment. No in-app refund initiation.

### Inherited from brief (fixed — not relitigated)
Astro 5 SSR on Cloudflare; D1 / R2 / Stream; Stripe Checkout (test mode); Resend transactional + magic-link auth; Brevo deferred (capture marketing-consent now, structure attributes for later sync); TypeScript; logic in Astro endpoints/actions (no separate API service); minimal deps; times stored UTC, displayed America/Los_Angeles; **`SITE_URL` env var from day one** (magic links, Stripe redirects, cert verification links — never hard-coded).

### Approved dependency budget
Astro Cloudflare adapter · Stripe SDK · Resend SDK · **Drizzle** (+ drizzle-kit) · zod · **pdf-lib** (M4) · **qrcode** (M4, cert QR) · **Anthropic SDK** (M6 only). The Anthropic API powers the M6 tutor. Anything else, I ask first.

---

## 3. Product decisions (resolved open questions)

| Topic | Decision |
|---|---|
| **Course price** | **$149** (`price_cents = 14900`), stored per-course. |
| **"First module free"** | The **entire Module 1, including its knowledge check, is free**. Paywall begins at **Module 2**. |
| **Knowledge checks** | **Attempt-to-proceed**, no passing score required to advance. The **80% final exam is the only pass gate** (threshold per-course, default 0.80). |
| **Oregon initial path** | account → 8-hour course → 4-hour hands-on with signed log → OBCE application → fingerprinting → state exam → certified → BLS within first year. |
| **Oregon renewal path** | confirm renewal date → 6-hour CE bundle → submit to OBCE. |
| **Certificate visual design** | ✅ M4: landscape PDF, logo wordmark, tiled watermark, QR + dual IDs (human serial + random verify code). Placeholder logo art pending final brand asset. |
| **Exam gate** | Changed from fixed-hours to **% of content watched** (≥90% of every lesson, `COMPLETION_THRESHOLD` in `progress.ts`) — stays correct as lessons change. `credit_hours` retained for the certificate face. |
| **Data retention** | Compliance data never auto-deleted (see decision #8). |
| **Refunds** | Manual in Stripe; app revokes enrollment on refund webhook (see decision #9). |

---

## 4. Proposed D1 schema

Principles: `events` append-only; derived totals always recomputed, never stored as counters; deferred features get columns/enums now (no future migration); certificates snapshot values at issuance; IDs are text UUIDs; timestamps UTC.

### `users`
`id` · `email` (unique) · `legal_name` · `display_name?` · `phone?` · `birth_month` (1–12) · `clinic_name?` · `supervising_dc_name?` · `supervising_dc_license?` · `supervising_dc_email?` · `role` (`student｜clinic_admin｜site_admin`) · `marketing_consent` (bool) · `marketing_consent_at?` · `created_at` · `updated_at`
> Brevo attributes (role, certified status, renewal month, courses completed, clinic) are computed at sync time, not stored.

### `magic_links`
`id` · `email` · `token_hash` · `intent` (`login｜signup`) · `expires_at` · `consumed_at?` · `created_at`

### `sessions`
`id` (opaque token) · `user_id` · `created_at` · `expires_at` · `last_seen_at` · `user_agent?` · `ip?`

### `playback_leases`  *(single active playback device)*
`id` · `user_id` · `lesson_id` · `device_id` · `acquired_at` · `expires_at` · `last_renewed_at`
> One live (non-expired) lease per user. Renewed by heartbeats; stale leases are stealable.

### `clinics`  *(M1.5 — clinic-owner path)*
`id` · `owner_user_id` · `name` · `seats_purchased` (int, default 0 — the only stored seat figure) · `created_at` · `updated_at`
> Seats *consumed* are recomputed from `clinic_members`, never stored.

### `clinic_members`  *(M1.5)*
`id` · `clinic_id` · `user_id?` (null until claimed) · `email` · `role` (`owner｜ca`) · `status` (`invited｜active｜removed`) · `invite_token_hash?` (sha-256; null for owner/claimed) · `invite_expires_at?` · `invited_at` · `claimed_at?` · `created_at`
> One `owner` row per clinic; each invited CA is a `ca` row. Seat consumed by CA rows in (`invited｜active`).

### `courses`
`id` · `slug` (unique) · `title` · `description?` · `credit_hours` (real) · `topic_category` (`general｜vitals｜cultural_competency｜hipaa`) · `state` (`oregon`) · `audience` (`ca｜dc`) · `content_type` (`ce_course｜library_episode`) · `access_model` (`one_time_purchase｜subscription｜free`) · `price_cents` (default `14900`) · `stripe_price_id?` · `status` (`draft｜published｜archived`) · `pass_threshold` (real, default `0.80`) · `max_playback_rate` (real, default `1.5`) · `instructor_name` (default `Jason Young, DC`) · `certifying_body_line?` · `created_at` · `updated_at`

### `modules`
`id` · `course_id` · `position` · `title` · `description?` · `is_free_preview` (bool — Module 1 = true)

### `lessons`
`id` · `module_id` · `position` · `title` · `stream_video_uid?` · `duration_seconds` · `evidence_type` (`playback_heartbeat｜live_attendance` — latter deferred) · `created_at`

### `lesson_transcripts`  *(M2 ingestion; serves captions now + M6 tutor retrieval later)*
`id` · `lesson_id` · `chunk_index` (order) · `start_seconds` · `end_seconds` · `text` · `created_at`
> One row per timestamped transcript chunk (from Riverside export). Deep-link targets for tutor citations come from `start_seconds`.

### `quizzes`
`id` · `course_id` · `module_id?` (null = course-level) · `kind` (`knowledge_check｜final_exam`) · `title` · `pass_threshold?` (override) · `created_at`

### `questions`
`id` · `quiz_id` · `position` · `prompt` · `type` (`single_choice｜multi_choice｜true_false`) · `explanation?`

### `answer_options`
`id` · `question_id` · `position` · `text` · `is_correct` (bool)

### `quiz_attempts`  *(SOLE system of record — append-only; failed attempts retained)*
`id` · `user_id` · `quiz_id` · `attempt_number` · `score` (real 0–1) · `passed` (bool) · `answers` (json snapshot) · `started_at` · `submitted_at`

### `path_templates`
`id` · `slug` (unique) · `name` · `description?` · `state` · `audience` · `status` (`draft｜published`)

### `path_template_steps`
`id` · `template_id` · `position` · `key` (stable, e.g. `hands_on_log`) · `title` · `description?` · `step_type` (`account｜course｜upload_log｜external_action｜exam｜bls｜custom`) · `course_id?` · `gating_rule` (json) · `evidence_required` (bool)

### `user_paths`
`id` · `user_id` · `template_id` · `status` (`active｜complete`) · `started_at` · `completed_at?`

### `user_steps`
`id` · `user_path_id` · `template_step_id` · `position` (snapshot) · `title` (snapshot) · `status` (`locked｜available｜in_progress｜complete｜waived`) · `evidence_ref?` · `completed_at?` · `updated_at`

### `enrollments`
`id` · `user_id` · `course_id` · `status` (`pending｜active｜completed｜refunded`) · `payment_status` (`unpaid｜paid｜free｜comp`) · `stripe_checkout_session_id?` · `stripe_payment_intent_id?` · `amount_cents?` · `enrolled_at` · `activated_at?` · `completed_at?`

### `events`  *(append-only audit trail)*
`id` · `user_id?` · `type` · `course_id?` · `lesson_id?` · `quiz_id?` · `occurred_at` (UTC) · heartbeat columns: `position_start_seconds?` · `position_end_seconds?` · `wall_seconds?` · `playback_rate?` · `payload` (json, for non-heartbeat detail)
> Types: `login` · `session_started` · `lesson_started` · `lesson_heartbeat` · `lesson_completed` · `quiz_attempt` (pointer only → `quiz_attempts.id`) · `enrollment_activated` · `enrollment_revoked` · `certificate_issued`.

### `certificates`
`id` · `user_id` · `course_id` · `verification_code` (unique, public) · `legal_name_snapshot` · `course_title_snapshot` · `credit_hours_snapshot` · `instructor_snapshot` · `issued_at` · `r2_key` · `status` (`issued｜revoked｜reissued`) · `supersedes_id?` · `created_at`

### `documents`  *(student vault)*
`id` · `user_id` · `type` (`hands_on_log｜other`) · `title` · `r2_key` · `verified_by?` · `notes?` · `uploaded_at`

---

## 5. Seat-time computation (compliance core — design note)

- Each `lesson_heartbeat` records `[position_start, position_end]` (content seconds), `wall_seconds`, `playback_rate`. Fired ~45s, only while playing in a focused tab, only while holding the playback lease.
- **Credited minutes = length of the union of covered intervals**, capped at `duration_seconds`. Rewatching never double-counts; credit ≤ content length.
- Pure, unit-tested `creditedSeconds(heartbeats, durationSeconds)` merges intervals in app code (SQLite can't union intervals). No stored totals — recomputed from `events`.
- **Final-exam gate:** Σ credited content-minutes across course lessons ≥ `credit_hours × 60`.
- Policy knobs (`max_playback_rate`, cadence tolerance, gate threshold) are config/query params — no schema changes to adjust policy.

---

## 6. Route map (M0–M2)

### M0 — Scaffold
- `GET /` — "hello" page proving SSR + `SITE_URL` wired from env.
- `GET /health` — JSON liveness (env present, D1 reachable).

### M1 — Auth + intake + roadmap
- `GET /login` · `POST /api/auth/request-link` (Resend magic link built from `SITE_URL`) · `GET /auth/callback?token=…` (verify → create session → new users to `/intake`) · `POST /api/auth/logout`.
- `GET /intake` + `POST /api/intake` (legal name, path selection [initial｜renewal｜clinic owner], clinic, supervising DC optional, birth month, marketing-consent) → instantiate roadmap (`user_paths` + `user_steps`).
- `GET /dashboard` — roadmap view.
- Session-resolution + route-protection middleware.

### M2 — Course player + seat time + transcripts
- `GET /learn/[courseSlug]` — overview, enrollment-gated (Module 1 previewable).
- `GET /learn/[courseSlug]/[moduleId]/[lessonId]` — lesson page, Stream embed + captions.
- `POST /api/stream/token` — signed Stream playback token for entitled user/lesson.
- `POST /api/playback/lease` — acquire/renew playback lease.
- `POST /api/lessons/[id]/heartbeat` — append heartbeat event (validates lease).
- `GET /api/lessons/[id]/progress` — credited minutes + resume position (recomputed).
- `scripts/upload-to-stream` — CLI: upload Riverside video → Stream, **ingest transcript into `lesson_transcripts` (chunked by timestamp), attach captions to the Stream video**, register the lesson.

---

## 7. Refinements to the milestone breakdown (no reordering)

1. Build `sessions` concurrency-friendly; enforce single playback via `playback_leases` (decision #3), not session kill.
2. Heartbeat fields as typed columns (indexable for the audit query); other events in `payload`.
3. `quiz_attempts` is the sole quiz record; `events` carries only a pointer (decision #6).
4. Public, unauthenticated cert verification route (`/verify/[code]`, M4).
5. `creditedSeconds()` ships as a pure, unit-tested function in M2.
6. **M2 transcript ingestion is a hard prerequisite for M6** — `lesson_transcripts` lands now so M6 needs no migration.

---

## 8. M6 — AI course tutor (post-launch, after M0–M5 ship)

- Chat sidebar on lesson pages, powered by the **Anthropic API**, retrieval over the enrolled course's `lesson_transcripts` chunks **only**.
- **Hard scoping:** answers exclusively from the enrolled course's transcripts; every answer **cites lesson + timestamp** and citations **deep-link the player** to that moment; out-of-scope questions — including any clinical advice — are politely declined. Positioned as a study companion.
- Only prerequisite (M2 transcript ingestion) is captured now. **Do not build before M0–M5 ship.**

---

## 9. Git / workflow

- `main` holds the approved, integrated state.
- Each milestone gets a named branch off `main`: `m0-scaffold`, `m1-auth`, `m2-player`, … merged back on completion.
- Small, frequent commits; never commit secrets (`.dev.vars` local, env vars documented in `README.md`).
- Product ambiguity → ask. Technical ambiguity → 2 options + recommendation. Plain-language recap + local test steps at the end of each block.

## 9a. Cloud-session network allowlist

The Claude Code **web environment** runs behind an egress proxy. As of this
session the environment is set to **Full** (any domain) for convenience. If we
later tighten it to **Custom** (recommended for a compliance product), allowlist
the hosts below. **Scope note:** this governs only the *dev sandbox* (the agent
running scripts/tests). The **deployed app runs on Cloudflare**, so production
outbound calls are unaffected by this setting.

| Host | Why | Milestone |
|---|---|---|
| `registry.npmjs.org` | `npm install` (in Trusted defaults already) | all |
| `github.com`, `*.githubusercontent.com` | git (via GitHub proxy; in defaults) | all |
| `api.anthropic.com` | Anthropic API (in Trusted defaults already) | M6 |
| `code.claude.com`, `docs.claude.com` | Claude Code docs (in defaults) | — |
| `api.resend.com` | Resend email send (only if we test real sends from the sandbox) | M1+ |
| `api.cloudflare.com` | Stream uploads + signing-key calls from `scripts/upload-to-stream` | M2 |
| `customer-*.cloudflarestream.com`, `*.videodelivery.net` | Stream playback/iframe + HLS (browser-side; sandbox only if we fetch) | M2 |
| `api.stripe.com` | Stripe API calls if exercised from the sandbox | M3 |
| `developers.cloudflare.com` | CF docs (optional) | — |

> Most of these fire from the **deployed Worker**, not the sandbox. The sandbox
> only needs a host allowlisted when *we* call it directly (e.g. running
> `scripts/upload-to-stream`, or a local script that hits Resend/Stripe).


---

## 10. M0 scaffold checklist (this session)

- [x] Astro 5 SSR + Cloudflare adapter, TypeScript.
- [x] `wrangler.toml` (D1/R2 bindings; Stream via API) + CF provisioning checklist (README).
- [x] Drizzle schema (all tables above) + first D1 migration (`migrations/0000_init.sql`).
- [x] Seed: one published $149 course (Module 1 free + lesson + knowledge check + final exam) + one student user + Oregon initial & renewal `path_templates`.
- [x] `SITE_URL` env var (`src/lib/env.ts`); `.dev.vars` (git-ignored); env vars documented in `README.md`.
- [x] `CLAUDE.md` (stack rules + domain model + compliance requirements).
- [x] Deployable "hello" `/` page + `/health` probe; verified locally (DB reachable, SITE_URL wired).
- [x] Small commits on `m0-scaffold`. **Next: owner runs CF provisioning + deploys; then confirm before M1.**

### Verified locally this session
- `npm run build` — clean.
- `npm run db:migrate:local` + `db:seed:local` — 19 tables created; seed loaded (1 user, 1 course, 2 modules, 11 path steps).
- `GET /health` → `{ ok: true, db: "ok", siteUrlPresent: true }`; `GET /` renders `SITE_URL` from env.

### Owner to-do to go live on pages.dev (see README "Cloudflare setup")
`wrangler login` → `d1 create chirosmarts` (paste `database_id` into `wrangler.toml`) → `r2 bucket create chirosmarts-docs` → `db:migrate:remote` + `db:seed:remote` → enable Stream + tokens → `npm run deploy` → set `SITE_URL` + secrets.
