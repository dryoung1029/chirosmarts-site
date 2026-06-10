# ChiroSmarts Platform — PLAN.md

> Living planning doc. Updated every session so the owner can share project state with his technical advisor.
> **Last updated:** 2026-06-10 — Session 1 (planning + scaffolding kickoff)

---

## 1. Current status

| Item | State |
|---|---|
| Current milestone | **M0 — Scaffold** (not started; awaiting plan approval) |
| Repo | Fresh, empty, branch `claude/ecstatic-allen-xs1hlt` |
| This session's goal | Clarifying questions → this plan → **wait for approval** → scaffold M0 only |

**Build order is strict and one-at-a-time: M0 → M1 → M2 → M3 → M4 → M5. Confirm before moving between milestones.**

---

## 2. Decisions made

### Locked this session (from kickoff Q&A)
1. **Data layer: Drizzle ORM** (thin, typed). Used for schema definition, migration generation, and simple typed queries. The compliance-critical recompute logic (unique video-position coverage → credited minutes) is **hand-written SQL / app code** regardless of ORM, because interval-union is not expressible cleanly in SQLite.
2. **Sessions: server-side D1 session table.** Opaque random token in an `HttpOnly`, `Secure`, `SameSite=Lax` cookie; row in D1 with expiry. Enables server-side revocation and underpins the compliance rule "one active playback session per user."
3. **Cloudflare provisioning: I document, owner runs.** I cannot access the CF account. The scaffold will include exact `wrangler` commands + dashboard steps to create the D1 database, R2 bucket, Stream, and Pages project. Owner runs them and pastes IDs into `wrangler.toml` + secrets.
4. **Certificate instructor of record: "Jason Young, DC"**, stored as a **per-course config field** (`instructor_name`, plus optional `certifying_body_line`) so attribution is editable without code changes.

### Inherited from brief (fixed — not relitigated)
- Astro 5 SSR on Cloudflare (Workers/Pages); D1 / R2 / Stream; Stripe Checkout (test mode); Resend transactional + magic-link auth; Brevo deferred; TypeScript throughout; logic in Astro endpoints/actions (no separate API service); minimal deps; all times stored UTC, displayed America/Los_Angeles.
- **`SITE_URL` env var from day one** — used for magic-link emails, Stripe redirect URLs, certificate verification links. Never hard-coded.

### Approved dependency budget
Astro Cloudflare adapter · Stripe SDK · Resend SDK · **Drizzle** (+ drizzle-kit) · zod · a PDF lib for certificates (proposing `pdf-lib` — pure JS, Workers-compatible, no native/system deps; confirm at M4). **Anything else, I ask first.**

---

## 3. Proposed D1 schema

Design principles baked in:
- **`events` is append-only.** Derived totals (seat time, completion, certified status, Brevo attributes) are **always recomputed**, never stored as mutable counters.
- **Deferred features get columns/enums now, no behavior** — so subscriptions, library content, live-attendance credit, additional states/paths need migrations, not redesigns.
- **Snapshots on issuance.** Certificates copy name/title/hours/instructor at issue time so later edits can't alter a historical certificate.
- IDs are text UUIDs. Timestamps are UTC ISO-8601 text (or unix int) — convention finalized in scaffold.

### `users`
`id` · `email` (unique) · `legal_name` (for certs) · `display_name?` · `phone?` · `birth_month` (1–12, renewal keying) · `clinic_name?` · `supervising_dc_name?` · `supervising_dc_license?` · `supervising_dc_email?` · `role` (`student｜clinic_admin｜site_admin`) · `marketing_consent` (bool) · `marketing_consent_at?` · `created_at` · `updated_at`
> Brevo attributes (role, certified status, renewal month, courses completed, clinic) are **computed at sync time**, not stored — keeps the audit model honest.

### `magic_links`
`id` · `email` · `token_hash` (we store a hash, email the raw token) · `intent` (`login｜signup`) · `expires_at` · `consumed_at?` · `created_at`

### `sessions`
`id` (opaque token) · `user_id` · `created_at` · `expires_at` · `last_seen_at` · `user_agent?` · `ip?`

### `courses`
`id` · `slug` (unique) · `title` · `description?` · `credit_hours` (real) · `topic_category` (`general｜vitals｜cultural_competency｜hipaa`) · `state` (`oregon`) · `audience` (`ca｜dc`) · `content_type` (`ce_course｜library_episode`) · `access_model` (`one_time_purchase｜subscription｜free`) · `price_cents` · `stripe_price_id?` · `status` (`draft｜published｜archived`) · `pass_threshold` (real, default `0.80`) · `max_playback_rate` (real, default `1.5`) · `instructor_name` (default `Jason Young, DC`) · `certifying_body_line?` · `created_at` · `updated_at`

### `modules`
`id` · `course_id` · `position` (order) · `title` · `description?` · `is_free_preview` (bool — supports "first module free" paywall)

### `lessons`
`id` · `module_id` · `position` · `title` · `stream_video_uid?` · `duration_seconds` · `evidence_type` (`playback_heartbeat｜live_attendance` — latter deferred) · `created_at`

### `quizzes`
`id` · `course_id` · `module_id?` (null = course-level) · `kind` (`knowledge_check｜final_exam`) · `title` · `pass_threshold?` (override; else course default) · `created_at`

### `questions`
`id` · `quiz_id` · `position` · `prompt` · `type` (`single_choice｜multi_choice｜true_false`) · `explanation?`

### `answer_options`
`id` · `question_id` · `position` · `text` · `is_correct` (bool)

### `quiz_attempts`  *(append-only — failed attempts retained, never overwritten)*
`id` · `user_id` · `quiz_id` · `attempt_number` · `score` (real 0–1) · `passed` (bool) · `answers` (json snapshot) · `started_at` · `submitted_at`

### `path_templates`  *(roadmap templates — data, not code)*
`id` · `slug` (unique) · `name` · `description?` · `state` · `audience` · `status` (`draft｜published`)

### `path_template_steps`
`id` · `template_id` · `position` · `key` (stable id, e.g. `hands_on_log`) · `title` · `description?` · `step_type` (`account｜course｜upload_log｜external_action｜exam｜bls｜custom`) · `course_id?` · `gating_rule` (json — e.g. `{requires_step_key, requires_certificate}`) · `evidence_required` (bool)

### `user_paths`  *(a user's enrolled roadmap)*
`id` · `user_id` · `template_id` · `status` (`active｜complete`) · `started_at` · `completed_at?`

### `user_steps`  *(instantiated per-user checklist rows; titles snapshotted)*
`id` · `user_path_id` · `template_step_id` · `position` · `title` (snapshot) · `status` (`locked｜available｜in_progress｜complete｜waived`) · `evidence_ref?` (R2 key or note) · `completed_at?` · `updated_at`

### `enrollments`
`id` · `user_id` · `course_id` · `status` (`pending｜active｜completed｜refunded`) · `payment_status` (`unpaid｜paid｜free｜comp`) · `stripe_checkout_session_id?` · `stripe_payment_intent_id?` · `amount_cents?` · `enrolled_at` · `activated_at?` · `completed_at?`

### `events`  *(append-only audit trail — the state-board record)*
`id` · `user_id?` · `type` · `course_id?` · `lesson_id?` · `quiz_id?` · `occurred_at` (UTC) ·
**heartbeat-specific typed columns** (nullable, so seat-time recompute is a clean SQL pull): `position_start_seconds` · `position_end_seconds` · `wall_seconds` · `playback_rate` ·
`payload` (json — everything else)
> Event types: `login` · `session_started` · `lesson_started` · `lesson_heartbeat` · `lesson_completed` · `quiz_attempt` · `quiz_passed` · `enrollment_activated` · `certificate_issued`. Quiz attempts live structured in `quiz_attempts`; `events` carries a pointer for the unified timeline.

### `certificates`
`id` · `user_id` · `course_id` · `verification_code` (unique, public) · `legal_name_snapshot` · `course_title_snapshot` · `credit_hours_snapshot` · `instructor_snapshot` · `issued_at` (completion date) · `r2_key` (PDF) · `status` (`issued｜revoked｜reissued`) · `supersedes_id?` (reissue chain) · `created_at`

### `documents`  *(student vault — signed hands-on logs, etc.)*
`id` · `user_id` · `type` (`hands_on_log｜other`) · `title` · `r2_key` · `verified_by?` (DC) · `notes?` · `uploaded_at`

---

## 4. Seat-time computation (the compliance core — design note)

This is the highest-risk piece, so flagging the approach now even though it lands in M2:
- Each `lesson_heartbeat` event records `[position_start, position_end]` (content seconds), `wall_seconds`, `playback_rate`. Fired ~every 45s, only while playing in a focused tab, only one active session per user.
- **Credited minutes = total length of the *union* of covered `[start,end]` intervals**, capped at `duration_seconds`. Rewatching never double-counts; credit can't exceed content length.
- Implemented as a **pure, unit-tested function** `creditedSeconds(heartbeats, durationSeconds)` that merges intervals in app code (SQLite can't union intervals well). No stored totals — recomputed on demand from `events`.
- **Final-exam gate:** sum of credited content-minutes across a course's lessons ≥ `course.credit_hours × 60`.
- Policy knobs (`max_playback_rate`, the 45s cadence tolerance, gate threshold) are config/query params — changeable without schema changes.

---

## 5. Route map (M0–M2)

### M0 — Scaffold
- `GET /` — "hello" page proving SSR + that `SITE_URL` is wired from env.
- `GET /health` — JSON liveness (env present, D1 reachable).

### M1 — Auth + intake + roadmap
- `GET /login` — request a magic link.
- `POST /api/auth/request-link` — create `magic_links` row, send via Resend (link built from `SITE_URL`).
- `GET /auth/callback?token=…` — verify token, create `sessions` row, set cookie; new users → `/intake`.
- `POST /api/auth/logout` — destroy session.
- `GET /intake` — post-signup form (legal name, path selection [initial｜renewal｜clinic owner], clinic, supervising DC optional, birth month, marketing-consent checkbox).
- `POST /api/intake` — persist user, instantiate roadmap from chosen `path_template` → `user_paths` + `user_steps`.
- `GET /dashboard` — roadmap view (ordered steps with status/gating).
- **Middleware:** session resolution + route protection.

### M2 — Course player + seat time
- `GET /learn/[courseSlug]` — course overview, gated by enrollment (first module previewable).
- `GET /learn/[courseSlug]/[moduleId]/[lessonId]` — lesson page, Stream embed.
- `POST /api/stream/token` — mint a signed Stream playback token for an entitled user/lesson.
- `POST /api/lessons/[id]/heartbeat` — append `lesson_heartbeat` event (validated with zod).
- `GET /api/lessons/[id]/progress` — credited minutes + resume position (recomputed).
- `scripts/upload-to-stream` — CLI: upload a local Riverside export to Stream, register it as a lesson.

---

## 6. Proposed changes / refinements to the milestone breakdown

1. **Pull "single active session" + a tested seat-time function forward conceptually.** The D1 session model (M1) is the substrate the M2 single-active-playback rule needs, and `creditedSeconds()` deserves unit tests the moment it exists. No reordering of milestones — just naming the dependency so M1's session table is built session-revocation-aware.
2. **Heartbeat fields as typed columns, not only JSON.** Deviates slightly from a pure JSON `payload`; rationale: the seat-time recompute query is the audit deliverable and benefits from indexable typed columns. Other event types stay in `payload`.
3. **Certificate verification route is public + unauthenticated** by design (`/verify/[code]`, lands M4) — surfacing now because it shapes the `certificates.verification_code` uniqueness/abuse considerations.
4. **`quiz_attempts` as its own append-only table** (not just events). Cleaner structured retention of failed attempts; `events` still gets a pointer row for the timeline.
5. Everything else: **build the brief as written.** No milestone reordering proposed.

---

## 7. Open questions (non-blocking — assumptions noted; will confirm before the relevant milestone)

| # | Question | Needed by | Working assumption |
|---|---|---|---|
| Q1 | Exact **price** of the initial CA certification course (and any renewal CE price)? | M3 | Placeholder in seed; confirm before paywall. |
| Q2 | "First module free, paywall after" — is the **entire first module** (all its lessons) the free preview, or just lesson 1? | M3 | First **module** free; rest paywalled. (`is_free_preview` on module.) |
| Q3 | Do **module knowledge checks gate progression** (must pass to advance), or are they ungraded practice? | M3 | Ungraded/practice; only the **final exam** gates certification. Confirm. |
| Q4 | **Exact roadmap steps** for the Oregon initial path beyond the brief's example (OBCE application URL, fingerprint vendor, BLS provider, exam logistics) — and whether any are just informational links vs. evidence-required. | M1 | Build the brief's example sequence; steps are pure data, easily edited. |
| Q5 | Certificate/PDF **visual design** — logo, layout, any required board language or license numbers on the cert face? | M4 | Clean text template w/ verification code + `instructor_name`; confirm before M4. |
| Q6 | **Data retention / audit window** the board expects (how long events/certs must be retained)? | Policy | Retain indefinitely (append-only); revisit. |
| Q7 | **Refund handling** — does a Stripe refund auto-revoke enrollment/cert, or manual admin action? | M3/M5 | Manual admin action for v1. |

---

## 8. What happens after you approve this plan

I scaffold **M0 only**:
- Astro 5 SSR + Cloudflare adapter project, TypeScript.
- `wrangler.toml` for local dev (D1/R2/Stream bindings) + a **provisioning checklist** (the CF commands you'll run).
- Drizzle schema (the tables above) + first D1 migration.
- Seed script: one fake published course (with a module/lesson/quiz) + one fake student user + the Oregon-initial `path_template`.
- `SITE_URL` wired as an env var; `.dev.vars` for local secrets (git-ignored); required env vars documented in `README.md`.
- `CLAUDE.md` capturing stack rules + domain model + compliance requirements.
- Deployable "hello" `/` page (targets the auto-generated `*.pages.dev` subdomain once you run the provisioning steps).
- Small, frequent commits.

Then I stop and confirm before M1.

---
*Reminder of working agreement: ambiguous **product** decisions → I ask. Ambiguous **technical** decisions → I propose 2 options + a recommendation. Never commit secrets. Plain-language recap + local test steps at the end of each block.*
