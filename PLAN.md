# ChiroSmarts Platform — PLAN.md

> Living planning doc. Updated every session so the owner can share project state with his technical advisor.
> **Last updated:** 2026-06-10 — Session 1 (plan approved with adjustments; scaffolding M0)

---

## 1. Current status

| Item | State |
|---|---|
| Current milestone | **Marketing + funnel + light design-token theme + semantic tutor + illustration integration — all shipped.** M0–M6, multi-course Phases 1–3, pricing, legal (draft), funnel (renewal checker, lead capture double-opt-in, Brevo groundwork), and the 15-illustration pass (see "Illustration integration (shipped)" below) done. **Phase 4 per-course clinic seat pools now built** (migration 0011; owner runs `db:migrate:remote`). |
| M0 | ✅ merged to `main` |
| M1 | ✅ fast-forward merged to `main` (was `m1-auth`) |
| M1.5 | ✅ built (clinic-owner path) |
| Plan | **Approved** 2026-06-10 with adjustments (folded in below) |
| Git model | `main` holds approved state; work happens on named milestone branches (`m0-scaffold`, `m1-auth`, `m1.5-clinic`, `m2-player`, …) merged to `main` |

### Help system (shipped 2026-06)
- **In-app Help Center** at `/help` (role-aware), distinct from `guides` (public
  SEO) and the AI course tutor (lesson content only). New `help` content
  collection (`src/content/help/*.md`, schema: title/summary/audience/category/
  order/related). 12 starter articles drafted (getting-started, student training,
  clinic management) with **`[VERIFY]`** flags on pricing/policy/required-minutes.
  `/help/index.astro` groups by category and surfaces the signed-in user's role
  topics first; `/help/[slug].astro` renders article + related + contact CTA.
- **Contact support** form `/help/contact` → `POST /api/help/contact`: zod-validated,
  honeypot anti-spam, signed-in email can't be spoofed (session email used),
  delivers via Resend to `EMAIL_REPLY_TO` (fallback: first ADMIN_EMAILS), reply-to
  = sender; logs a `support_request` event. Surfaces a fallback inbox if Resend
  fails. **Depends on Resend domain verification to actually deliver.**
- **Contextual `?` help** = `src/components/HelpTip.astro` (native Popover API,
  zero JS, optional deep-link to an article). Wired on `/clinic` (Buy seats,
  Transfer). More placements (course player seat-time/exam-gate) TODO.
- Wiring: `/help` added to middleware public paths; "Help" link in app nav + footer.
- **Not built (deferred):** AI help assistant over help docs (owner deprioritized
  for now); help-article search; admin-audience articles.

### Design tokens (shipped)
- **One source of truth:** `src/styles/tokens.css` defines the brand palette (--brand teal, --action orange, --ink/--muted, --canvas/--surface, success/warning/danger + tints, gold, derived --border/--focus/--shadow) and is imported by both layouts — components reference tokens only, **no raw hexes** (emails keep inline hex; CSS vars don't work in mail clients). Back-compat aliases (`--bg/--panel/--text/--accent/--ok/--warn`) re-map the existing app to the light theme.
- **Usage rules** baked into base styles: --action for primary CTAs only; secondary = --brand outline; links = --brand underlined; success/warning/danger map to cert states (current/approaching/lapsed), never decorative; amber-tint text uses --warning-ink (#633806); focus rings --brand 2px. Hero demo, logo, and certificate (PDF + preview) retokenized to ink+teal+gold. **WCAG verified** — body ≥4.5:1, state/large ≥3:1 on every pairing.

### Marketing storefront + funnel — first slice (shipped)
Public, SEO-first, dark-themed marketing layer (`MarketingLayout.astro`) on top of the app. Cloudflare Web Analytics only (no other trackers); prices/titles/hours always from the DB.
- **Shipped:** homepage `/` (hero + owner-copy CTAs + **animated hero demo**, audience router, stats bar, how-it-works, instructor block, testimonials grid, DB catalog teaser, FAQ, preserved NBCE disclaimer); upgraded course landing `/courses/[slug]` (requirements-mapping table, certificate preview, syllabus, course-tagged testimonials, course FAQ, sticky mobile CTA, refund line → Terms); `/clinics`, `/renewal` (checker slot), `/about`; **guides system** (`src/content/guides/`) with ToC + Article JSON-LD + byline + related-course card and two stub entries; `sitemap.xml`, `robots.txt`; SEO component with canonical/OG/Twitter; JSON-LD **Organization** (sitewide), **Course**, **FAQPage**, **Article**.
- **Hero demo** (`HeroDemo.astro` + `/hero-demo.js`, **2.6KB** ≤ 30KB): code-built loop of a fictional "Maya R." dashboard (checklist → course ring 0→8.0 → hands-on signed → exam passed → certificate → maintain mode), `prefers-reduced-motion` static fallback, IntersectionObserver pause. All data visibly fictional.
- **Rendering choice (documented):** marketing pages are **edge-SSR** (server-rendered per request — one fast DB query) rather than statically prerendered, because catalog prices and auth-aware nav are dynamic; still fully server-rendered HTML for SEO.
- **Analytics how-to:** set `CF_WEB_ANALYTICS_TOKEN` (env) → the cookieless beacon injects into the marketing layout only; view in Cloudflare dashboard → Analytics & Logs → Web Analytics.

#### Copy status — owner copy is now IN (`src/config/marketing.ts`, `COURSE_MARKETING`, guides, course descriptions). Two registries remain:

**`[VERIFY]` launch blockers — ✅ ALL RESOLVED (2026-06-24).** Owner certified
these against **oregon.gov/obce as the canonical source** (and his own bio
facts); every live `[VERIFY]` flag is removed. Record of what was decided:
- Instructor bio: practicing in Corvallis **since 2008**; NBCE title corrected to
  **"at-large director"** (bio, credentials, "Who's behind this" FAQ, both guide
  frontmatters).
- Homepage FAQ: duties-before-certification framing confirmed; cost answer now
  cites **$175** initial OBCE application (incl. $45 Fieldprint background) +
  oregon.gov/obce; legacy-records Q makes **no record-keeping promise** — points
  to the **/verify** certificate-verification page instead.
- Course (`oregon-ca-initial`): all six requirements-table rows confirmed vs OBCE
  (flag removed); "accepted by the board" FAQ reworded to **"Dr. Young is an
  authorized trainer for the OBCE CA initial training."**
- Renewal page + Guide 2: birth-month deadline confirmed; **6 CE hrs/yr**;
  **vitals = 2 hrs EVERY year** (corrected from first-renewal-only, per OBCE);
  cultural competency 1 hr/yr; grace ($25/30 days) + $75 late + 12-month
  reinstatement-then-reapply; renewal fee **$117 + $2 OHA survey**.
- Guide 1: requirements list, hands-on topics (hydro/electro/physiotherapy),
  online application + **Fieldprint** vendor, **open-book NBCE** exam, $175/$45
  fees. BLS softened to OBCE's wording (**BLS/AED/CPR from a recognized provider
  within the first year** — OBCE lists no providers/format).
- `src/config/oregon-renewal.ts`: `firstRenewalHours`/`subsequentRenewalHours`
  now **6** (was null); `requirementsNote` filled (cultural competency + vitals).
- Soft non-OBCE estimate left as-is (not a regulatory claim): Guide 1 BLS price
  **"$50–90"**.

**Still pending owner inputs** (render as `[OWNER COPY]` chips or are omitted):
- **Stats** — kept EMPTY (owner's numeric stats were `[VERIFY]`; "only real numbers can ship"). Fill `OWNER.stats` with confirmed figures to show the bar.
- **Testimonials** — none yet; add `src/content/testimonials/*.md` (real only).
- **Instructor photo / About story**; **guide last-updated dates** (frontmatter `lastUpdated: "[ADD DATE]"` — JSON-LD date is omitted until set); **clinic dashboard image** + **overview video** Stream UID.
- Assets: ~~proper per-page OG PNG (currently the branded `og-default.svg`)~~ → **done** for the default card (`public/og-default.png`, 1200×630, illustration-13 + wordmark; `og-default.svg` retired). Per-PAGE OG cards still deferred.
- Config: `effectiveDate` (legal), `CF_WEB_ANALYTICS_TOKEN`, Brevo keys, Oregon renewal hour figures, the lead-magnet checklist PDF in R2.

#### Funnel layer (shipped)
- **Renewal-date checker** (`/renewal`): deadlines for all 12 months are computed server-side with the unit-tested `nextRenewalDeadline` (no forked date logic in the client — island ~1.7KB just looks up the selection); first-vs-subsequent hour figures come from `src/config/oregon-renewal.ts` (**owner-supplied; null → visible `[OWNER COPY]` placeholder**, never invented). Works fully without an email. 8 unit tests in `renewal.test.ts`.
- **Lead capture + DOUBLE OPT-IN** (`marketing_leads` table, migration 0007): `POST /api/leads/capture` stores a `pending` lead + emails a Resend confirm link; `/leads/confirm` flips it to `confirmed` (single-use token) and, for the checklist source, serves the asset. `lead_captured` + `lead_confirmed` events. Verified end-to-end in dev.
- **Lead magnet** (`LeadCapture.astro` on the homepage): the Oregon CA checklist; the gated `/api/leads/asset` streams the R2 object at `lead-magnets/oregon-ca-checklist.pdf` only to a confirmed checklist lead. **Owner action:** upload that PDF to R2 (`wrangler r2 object put chirosmarts-docs/lead-magnets/oregon-ca-checklist.pdf --file=…`) — until then the route returns a graceful "not available yet."
- **Brevo sync** (`src/lib/brevo.ts`, admin overview "Sync to Brevo" button): manual, pushes only **confirmed leads + opted-in users** with attributes (source, birth_month, role); marks `synced_to_brevo_at`; no campaigns; no-op until `BREVO_API_KEY` + list IDs are set.

#### Funnel placeholders / owner actions
- `src/config/oregon-renewal.ts`: `firstRenewalHours`, `subsequentRenewalHours`, `requirementsNote` (regulatory figures — owner supplies).
- Upload `lead-magnets/oregon-ca-checklist.pdf` to R2 for the lead magnet.
- Set `CF_WEB_ANALYTICS_TOKEN`, `BREVO_API_KEY`, `BREVO_LIST_ID_LEADS`, `BREVO_LIST_ID_USERS` when ready.

#### Still deferred
Per-course OG images; light marketing framing on `/verify`; embedding the renewal checker on the homepage; (MDX for inline-CTA-in-markdown was avoided to respect the dependency policy — guides use a fixed related-course card).

### Illustration integration (shipped)
15 illustrations live at `src/assets/illustrations/illustration-NN-*.png` (4–5 MB each). All placed images are **DECORATIVE** (`alt=""`, `aria-hidden`, never replace text), lazy-loaded (except the 404 hero), padded with `--canvas` (#FAFAF7) at native aspect ratio (never cropped/stretched), with explicit width/height to avoid CLS.

- **Delivery — IMPORTANT deviation from the handoff.** The handoff assumed `astro:assets <Picture>` + `imageService: 'compile'` would optimize at build. It does **not** for this site: every page is SSR (`output: server`, D1-backed, nothing prerendered), and on Cloudflare the compile service's `/_image` endpoint is a **runtime passthrough** (`fetch(original)`, no sharp at the edge) — it would ship the raw 4–5 MB PNGs and tank Lighthouse. **Resolution:** a build script (`scripts/build-illustration-assets.mjs`, `npm run assets:illustrations`) pre-generates responsive **AVIF + WebP + a PNG fallback** at per-placement width ladders into `public/illustrations/`, plus a typed manifest `src/lib/illustration-manifest.ts` (intrinsic AR + width ladder). `src/components/marketing/Illustration.astro` renders a plain `<picture>` (`name=` prop, manifest-driven srcset). Total generated payload **~1.1 MB** for all variants. `imageService: 'compile'` is kept only so incidental `astro:assets` use builds cleanly.
- **Placement map (filled):** audience cards 02/03/04 (`index`), how-it-works 08 (`index`), course syllabus 05 (oregon-ca-initial) / 06 (vitals-monitoring) + certificate-moment 07 in every course's final CTA (`courses/[slug]`), dashboard empty-state 10, clinics dashboard 11 (replaced the dashed `owner-copy` placeholder), guide header 12 (all guides, `guides/[slug]`), 404 hero 14 (**new `src/pages/404.astro`**).
- **OG + email:** `og-default.png` (1200×630) = illustration-13 + teal wordmark in the left negative space; `MarketingLayout` defaults to it and emits `og:image:width/height` + `twitter:image`; `og-default.svg` deleted. Email images downscaled to ≤600px email-safe PNG in `public/email/` and embedded as **absolute `SITE_URL` URLs**: certificate-moment 07 in `lib/email/certificate.ts`, renewal-reminder 09 in the renewal lead-confirm mail (`lib/leads.ts`, renewal source only).
- **Unfilled slots / notes:** illustrations **01 (roadmap)** and **15 (patient-checkin)** have no slot in the map (extras — unused). Courses other than oregon-ca-initial/vitals (hipaa, cultural, cbt, renewal bundle) get no per-course syllabus visual (no mapping; the generic certificate-moment still shows). Per-page OG cards still deferred. Lighthouse not re-measured in this environment (no headless browser); payloads are small (cards ≤320px AVIF, largest below-fold image ~1456px clinic dashboard) and all below-fold images are lazy — homepage score expected to hold ≥90; **re-run Lighthouse after deploy** to confirm.
- **Regenerating:** edit the `PLACED` list / OG / email logic in `scripts/build-illustration-assets.mjs`, run `npm run assets:illustrations`, commit the regenerated `public/illustrations/**`, `public/og-default.png`, `public/email/**`, and `src/lib/illustration-manifest.ts`.

### Multi-course expansion — Phases 1–3 (shipped)
- **Phase 1 — exam gate / `required_seat_minutes`.** New nullable `courses.required_seat_minutes` (content-minutes floor, clamped to runtime so never unsatisfiable), **decoupled from `credit_hours`** (cert figure only). Note: the live gate never actually used `credit_hours × 60` — it was already per-lesson-90% coverage; this adds the explicit floor + admin knob. Seeded single-module **Vitals** ($39, `rsm=5`, credit 1h) and **HIPAA** ($35) courses.
- **Phase 2 — catalog + multi-course.** Public `/courses` catalog + `/courses/[slug]` landing (only content is gated, Q6). Dashboard "Your courses" grid. Checkout + webhook generalized to a **course-id list** (bundle-ready).
- **Phase 3 — course resources.** `course_resources` table (R2-backed) for assets the course PROVIDES (e.g. the Vitals practice-log PDF) — admin upload/delete in the content editor, entitlement-gated download route, downloads section on the course page. Distinct from `documents` (student's uploaded evidence).

### Pricing model (Item 1 — shipped)
- Price card lives in the DB (`courses.price_cents`) as the **single source of truth**; **zero hard-coded prices** in code (removed the clinic `SEAT_PRICE_CENTS` and the schema `$149` default). Seeded: CA $149, Renewal Bundle $89, Cultural Competency $29, Vitals $39, HIPAA $35, CBT $49. Not-yet-authored courses created **`status='draft'`** with their prices.
- **Per-course pricing, no per-hour/hours-bank concept.** Clinic seat price = the course's current DB price × count (dynamic Stripe amounts).
- **Bundles as data:** a bundle is one saleable `courses` row; `bundle_items(bundle_course_id, child_course_id)` maps it to constituents; checkout/webhook `expandFulfillment()` enrolls the children. Renewal Bundle → vitals + cultural competency. Verified: buying the bundle enrolls the constituents, not the bundle SKU.
- Display: whole dollars on marketing surfaces, cents at checkout/receipts (Stripe). Price changes log a `course_price_changed` event (admin editor); **historical purchases keep the price paid** — never recalculated. No subscription products (the `accessModel='subscription'` enum stays unused).

### Legal pages (Item 2 — shipped, pending real text)
- `/terms` + `/privacy` rendered from `src/content/legal/*.md` (content collection) — owner edits via commit; "Last updated" from frontmatter. **`legal-policies.md` was not in the repo**, so the bodies are visible placeholders (no invented legal text). Placeholders (`[LEGAL ENTITY NAME]`, `[CONTACT EMAIL]`, `[EFFECTIVE DATE]`) + version strings centralized in `src/config/legal.ts`.
- Footer links both pages on every page. Checkout entry points show "By purchasing you agree to the Terms of Service"; intake shows a required "By creating an account you agree to the Terms of Service and Privacy Policy" line (in addition to the optional marketing checkbox). `terms_accepted` event (with `termsVersion`) written at signup and at each purchase, so future policy updates can require re-acceptance (no re-acceptance UX built).
- **Before first real payment:** owner must paste the real ToS/Privacy text and set the `src/config/legal.ts` constants.

### Public free preview (shipped 2026-06)
Per-lesson **public free preview** so logged-out visitors can watch the start of a
lesson on the course landing page. Schema: `lessons.is_preview` + `preview_seconds`
(migration 0009, additive). Admin content editor has a **Free preview** checkbox +
**Preview (s)** field per lesson. Unauthenticated `POST /api/stream/preview-token`
mints a signed Stream token **only** for `is_preview` lessons (hard-gated; can't be
used for paywalled content) — allowlisted in middleware. `/courses/[slug]` renders a
"Watch a free preview" player (`public/preview-player.js`) that embeds the Stream
player and **hard-stops at `preview_seconds`** with an enroll overlay. **Marketing
only — previews accrue NO seat time / heartbeats.** Cap is client-side (a determined
viewer could fetch more via the token; the rest of the course stays paywalled). Owner
action: flag a lesson as preview in Admin → Content; run `db:migrate:remote`.

### Collateral Studio — PROPOSED (2026-06-25), not built
Admin tool to generate/edit/publish PDF collateral (Phase 1: **study guide,
checklist, cheat-sheet**) from a course's `lesson_transcripts`, via Claude
Sonnet → Markdown editor → `pdf-lib` PDF → R2 → `course_resources` student
download. **Voice fidelity is a requirement** — a distilled voice profile from
the owner's transcripts + his `yourbodyofhealth.com/articles` (style only, not
content) is injected into every prompt; extractive-leaning toward his own
phrasing. Owner-in-the-loop (nothing publishes unapproved). Diagrams = code-built
SVG (no Mermaid — needs a browser, unavailable on Workers). **AI image-gen
deferred** (anatomy/text accuracy = brand/liability risk). No new Phase-1 deps.
Full spec + data model (`course_collateral`) + build order in
**`docs/collateral-studio-design.md`**. Awaiting owner go-ahead to build P1a
(schema + additive migration + admin scaffold).

### Phase 4 — per-course clinic seat pools (SHIPPED 2026-06)
Built on branch `claude/charming-faraday-ixrhmb` from the approved design + DDL
(`docs/phase4-seat-pools-ddl.md`). Migration **0011** (generated DDL + hand-written
backfill) applies clean on local D1; **owner action: run `npm run db:migrate:remote`.**

- **Schema**: `clinic_seat_pools(clinicId, courseId, seatsPurchased)` (the only stored
  count) + `seat_assignments` (one row per person+course; `invited｜active｜expired｜revoked`).
  `enrollments.paymentStatus` gains `clinic_seat` (type-only, no migration). `clinics.seatsPurchased`
  kept (deprecated) and backfilled into a CA-initial pool — never dropped (D1 rebuild limitation).
- **Libs**: `src/lib/clinic.ts` is now clinic+member **identity** only (`findCaMemberByEmail`,
  `ensureCaMember`, `linkMemberToUser`). New `src/lib/seat-pools.ts` owns pools + assignments:
  pure `consumedSeats`/`summarizePool` (consumed = invited+active, available clamped ≥0,
  **recomputed never stored**), `grantPoolSeats`, `assignSeat`, `acceptSeatToken`,
  `claimSeatsForMember`, `revokeAssignment`, lazy `expireStaleAssignments` (30-day invite TTL).
  **9 unit tests** in `seat-pools.test.ts` (52 total pass).
- **Assign flow**: already-active member → **immediate** `active` assignment + `clinic_seat`
  enrollment (no invite/email); new/unclaimed CA → emailed one-time claim link (`/clinic/join`),
  and claiming activates **every** pending assignment for that member. Unique `(member,course)`
  index ⇒ re-grant after expiry/revoke **reactivates the row in place** (`upsertAssignment`).
- **Endpoints**: `POST /api/clinic/seats` `{courseId,count}` (price from that course's DB row;
  comped in test mode, Stripe-metadata `courseId` for the paid webhook), new `POST /api/clinic/assign`
  `{courseId,email}`, `POST /api/clinic/revoke` `{assignmentId}`. Old `/api/clinic/invite` removed.
- **Webhook**: `kind=seats` grants to the right pool; an unmatched `charge.refunded` (i.e. a
  seat-pool purchase) logs `clinic_seat_refund_manual_review` — **no pool shrink, no enrollment/cert
  revoke** (manual handling, per the record).
- **Dashboard**: per-course pool panels (bought / in-use / available, buy-seats course picker —
  standalone published courses only, bundles excluded — assign form, per-pool roster, revoke).
- **Audit events**: `clinic_pool_seats_granted`, `clinic_seat_assigned`, `clinic_seat_claimed`,
  `clinic_seat_assignment_revoked`, `clinic_seat_refund_manual_review`.
- **Verified**: 52/52 unit tests, `astro check` 0 errors, build clean, migration applies on local
  D1, and SQL-level invariants checked (consumed recompute, NULL-token coexistence, unique-index
  re-grant rejection). **Not yet exercised through the browser / against remote D1.**

#### Original locked decisions (for reference):
- **Normalized `seat_assignments(memberId, courseId, status, enrollmentId, …)`**; `clinic_members` stays one row per person and keeps the invite/claim machinery. Assigning an **already-active** member requires **no invite**. (Rationale: annual renewal re-grants courses yearly; per-person-per-course-per-year roster rows would explode.)
- Per-course `clinic_seat_pools(clinicId, courseId, seats_purchased)`; consumed seats **recomputed** from assignments. Backfill the existing single `clinics.seats_purchased` into a pool row for `crs_or_ca_initial`.
- New enrollment `payment_status='clinic_seat'` (distinct value, not `comp`).
- **Seat lifecycle (record):** unclaimed invites **expire after 30 days and free the seat**; **claimed seats are permanently consumed**; a member **leaving the clinic never revokes their enrollments or certificates**.
- **Refunds (record):** clinic-seat enrollments are **non-refundable at the student level**; refund webhooks **log an event for manual handling — no automatic pool shrinking**.

### M6 — what shipped this build (AI course tutor)
- **Model**: Claude Haiku 4.5 via the official `@anthropic-ai/sdk` (the one approved M6 dep), called from `src/lib/tutor.ts`. `ANTHROPIC_API_KEY` is a prod secret — without it the tutor replies "not configured yet" (retrieval + UI still work).
- **Retrieval over `lesson_transcripts` ONLY**, entitlement-scoped to the student's accessible modules (no paywall leakage).
- **Semantic search (upgrade)**: Cloudflare **Workers AI** embeddings (`@cf/baai/bge-small-en-v1.5`, 384-dim, `AI` binding) stored in `transcript_embeddings` (D1 blob, migration 0008); the tutor ranks chunks by **cosine similarity** (computed in-JS over a course's vectors — no Vectorize) and **hybridizes** with keyword/IDF anchors so exact-term matches aren't lost. Falls back to pure keyword retrieval if the AI binding or embeddings are absent. Top chunks are expanded with neighbours into coherent passages; off-topic questions fall below a similarity floor and decline. **Verified on prod**: conceptually-phrased questions (e.g. "how do I keep patient information private?") now retrieve the right content despite no word overlap. **Owner action**: after ingesting new transcripts, click **Admin → AI tutor → Embed transcripts** (or `POST /api/admin/embed-transcripts` until `remaining:0`). Workers AI free tier covers this corpus + query volume.
- **Grounding + guardrails**: system prompt answers only from numbered sources, cites `[n]`, declines out-of-scope + clinical/medical advice, says so when the material doesn't cover it. Off-topic questions short-circuit before any API call (cost saver).
- **Citations deep-link** to `/learn/{slug}/{moduleId}/{lessonId}?t={sec}`; the player (`public/lesson-player.js`) now honors `?t=` to seek (Stream + sim adapters).
- **Both placements**: course page `/learn/[slug]/tutor` + per-lesson sidebar, sharing `TutorPanel.astro` + `public/tutor-panel.js` and the `POST /api/tutor` backend. Roadmap links to the tutor page.
- **Audit**: every question logs an append-only `tutor_query` event (question + cited lessons).
- Seeded a sample transcript for the free-preview lesson (demo + `tutor.test.ts`). **Verified** via `wrangler pages dev`: entitlement-scoped retrieval, on-topic vs off-topic paths, deep-link seek, event logging, both pages render.

### M5 — what shipped this build (admin)
- **Admin access**: `ADMIN_EMAILS` env allowlist → `isAdmin` (role OR allowlist) in `src/lib/admin.ts`; middleware guards `/admin` + `/api/admin`; login auto-promotes matching accounts to `site_admin`. Owner's email is in `wrangler.toml [vars]`.
- **Overview** (`/admin`): account/enrollment/completion/cert counts + recent certificates.
- **Students** (`/admin/students`): searchable roster; **audit** (`/admin/students/[id]`) — per-course seat-time breakdown (per-lesson credited vs length, %, ≥90% gate), append-only quiz attempts, certificate list with download/verify, and the raw recent-event trail.
- **Content** (`/admin/content`): course list + editor for course/module/lesson metadata (titles, description, credit hours, instructor, pass threshold, max rate, status, free-preview, positions). Zod-validated update endpoints. Video stays via the upload script; quiz authoring deferred.
- **Certificate lifecycle**: revoke + reissue endpoints/actions; reissue supersedes the old (`reissued`) and mints+emails a fresh cert; `getActiveCertificate` now returns only `issued`; verify page shows valid/revoked/superseded.
- **Verified** with a forged local admin session via `wrangler pages dev`: all pages render 200, metadata save round-trips, guard redirects non-admins, Astro CSRF origin-check active.

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
Astro Cloudflare adapter · Stripe SDK · Resend SDK · **Drizzle** (+ drizzle-kit) · zod · **pdf-lib** (M4) · **qrcode** (M4, cert QR) · **Anthropic SDK** (M6 only) · **tus-js-client** (admin video upload to Stream — owner-approved 2026-06). The Anthropic API powers the M6 tutor. Anything else, I ask first.

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
