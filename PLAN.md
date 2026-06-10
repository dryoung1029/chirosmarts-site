# ChiroSmarts Platform — PLAN.md

> Living planning doc. Updated every session so the owner can share project state with his technical advisor.
> **Last updated:** 2026-06-10 — Session 1 (plan approved with adjustments; scaffolding M0)

---

## 1. Current status

| Item | State |
|---|---|
| Current milestone | **M0 — Scaffold** (in progress) |
| Plan | **Approved** 2026-06-10 with adjustments (folded in below) |
| Git model | `main` holds approved state; work happens on named milestone branches (`m0-scaffold`, `m1-auth`, …) merged to `main` |

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
Astro Cloudflare adapter · Stripe SDK · Resend SDK · **Drizzle** (+ drizzle-kit) · zod · **pdf-lib** (M4) · **Anthropic SDK** (M6 only). The Anthropic API powers the M6 tutor. Anything else, I ask first.

---

## 3. Product decisions (resolved open questions)

| Topic | Decision |
|---|---|
| **Course price** | **$149** (`price_cents = 14900`), stored per-course. |
| **"First module free"** | The **entire Module 1, including its knowledge check, is free**. Paywall begins at **Module 2**. |
| **Knowledge checks** | **Attempt-to-proceed**, no passing score required to advance. The **80% final exam is the only pass gate** (threshold per-course, default 0.80). |
| **Oregon initial path** | account → 8-hour course → 4-hour hands-on with signed log → OBCE application → fingerprinting → state exam → certified → BLS within first year. |
| **Oregon renewal path** | confirm renewal date → 6-hour CE bundle → submit to OBCE. |
| **Certificate visual design** | Deferred to M4. |
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

---

## 10. M0 scaffold checklist (this session)

- [ ] Astro 5 SSR + Cloudflare adapter, TypeScript.
- [ ] `wrangler.toml` (D1/R2/Stream bindings) + CF provisioning checklist.
- [ ] Drizzle schema (all tables above) + first D1 migration.
- [ ] Seed: one published $149 course (module/lesson/quiz) + one student user + Oregon initial & renewal `path_templates`.
- [ ] `SITE_URL` env var; `.dev.vars` (git-ignored); env vars documented in `README.md`.
- [ ] `CLAUDE.md` (stack rules + domain model + compliance requirements).
- [ ] Deployable "hello" `/` page (targets `*.pages.dev` after provisioning).
- [ ] Small commits on `m0-scaffold`; stop and confirm before M1.
