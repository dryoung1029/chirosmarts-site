# Collateral Studio — design doc

> Admin authoring + publishing tool that turns a course's transcripts into
> downloadable PDF collateral (study guides, checklists, cheat-sheets). Built on
> existing pieces: `lesson_transcripts`, the Anthropic SDK (tutor), `pdf-lib`
> (certificates), R2, `course_resources`, and the admin section.
>
> Status: **proposed** (2026-06-25). Not built. Owner locked Phase-1 scope below.

## 1. Goal & principles

- For **any** course the owner creates, generate supportive collateral from the
  material the owner is strong at (presentations → transcripts), filling the gap
  the owner is weaker at (handouts/manuals/study aids).
- **Owner-in-the-loop, always.** Nothing publishes without the owner reviewing
  and approving the draft. The owner's name and regulatory credibility are on
  every page — accuracy beats automation.
- **Reuse, don't rebuild.** Source = `lesson_transcripts`; engine = Claude
  (already approved); render = `pdf-lib` (already approved); store = R2; surface
  to students = `course_resources` (already the per-course download table).

## 2. Phase 1 scope (locked with owner)

- **Types:** `study_guide`, `checklist`, `cheat_sheet`. (Glossary / practice-Qs
  deferred — schema enum leaves room.)
- **Source scope:** whole course or a single module (selectable). Lesson-level
  later.
- **Generation:** Claude **Sonnet** (stronger than the Haiku tutor; this is an
  infrequent, admin-triggered, quality-sensitive action). New `src/lib/collateral.ts`.
- **Edit:** admin Markdown editor — regenerate, hand-edit, approve.
- **Render:** `pdf-lib` + a Markdown→PDF layout renderer (Option A,
  dependency-light). Branded header/footer, brand tokens, embedded font (reuse
  the certificate font).
- **Diagrams:** code-generated **SVG** from a structured spec the model emits
  (flow / timeline / process / decision). **No Mermaid** (needs a browser/DOM;
  unavailable on Workers). Only when they add value; text-first otherwise.
- **Publish:** approved draft → render PDF → store in R2 → upsert a
  `course_resources` row (`type='handout'`) → enrolled students download from the
  course page / dashboard (existing wiring).

Explicitly **out** of Phase 1: AI raster/anatomical illustration (accuracy &
liability risk), rich magazine layout via Browser Rendering, multi-language.

## 3. Data model — new `course_collateral`

Editable source of truth (the published PDF is a derived artifact in
`course_resources`).

| column | type | notes |
|---|---|---|
| `id` | text pk | `coll_…` |
| `course_id` | text fk→courses | |
| `scope` | enum `course`\|`module`\|`lesson` | default `course` |
| `scope_ref_id` | text null | module/lesson id when scoped |
| `type` | enum `study_guide`\|`checklist`\|`cheat_sheet`\|`glossary`\|`practice_questions`\|`handout` | |
| `title` | text | |
| `status` | enum `draft`\|`published` | default `draft` |
| `body_markdown` | text | the editable content |
| `model` | text | generation model id (provenance) |
| `source_meta` | text (json) | lesson ids + transcript snapshot used |
| `r2_key` | text null | published PDF object |
| `resource_id` | text null fk→course_resources | the student-facing row |
| `version` | int | bump on each publish |
| timestamps | | `created_at`,`updated_at`,`published_at` |

Migration is **additive** (new table only) — safe on D1 (no table rebuild).

## 4. Generation (`src/lib/collateral.ts`)

- Pull transcripts for the scope; for a whole course this can be large →
  **map-reduce**: summarize per lesson, then compose the collateral from the
  summaries (keeps within context, preserves coverage).
- **Per-type prompts:**
  - *study_guide* — learning objectives, section summaries, key terms, "review
    this" pointers with `lesson + timestamp` (reuse tutor's deep-link idea),
    self-check questions.
  - *checklist* — actionable checkbox items grouped by phase/topic.
  - *cheat_sheet* — dense, scannable: tables, bulleted essentials, "must-know"
    callouts.
- Output is **strict Markdown** (plus optional fenced ```diagram blocks of
  structured JSON the SVG renderer understands).
- Grounded in transcripts only (same discipline as the tutor) — no invented
  regulatory facts; flag anything it can't support.

## 4a. Voice fidelity (owner requirement)

The collateral must sound like **Dr. Young**, not generic e-learning. His voice is
the differentiator; the tool leans on it deliberately.

- **Voice profile** — a distilled style guide (`src/config/voice-profile.md`,
  injected into every generation prompt) built from two owner-authorized sources:
  1. **Transcripts** — his actual spoken explanations (primary; also the content).
  2. **`yourbodyofhealth.com/articles/*`** — his written articles (voice only).
- **Observed voice** (from sampled articles, to encode in the profile):
  evidence-based and plain-spoken; **direct second-person address** ("your
  visceral fat is elevated…"); concrete specifics and numbers over vague claims;
  occasional historical/origin framing; short declarative sentences mixed with
  one longer explanatory line; no hype, no filler.
- **Extractive-leaning** — prefer the owner's own phrasing from transcripts over
  paraphrasing into textbook tone. The model rewrites for structure, not for a
  different personality.
- **Hard guardrail — voice, not content lifting.** Collateral *content* comes from
  the **course transcripts**. The clinic articles inform **style only**; never
  copy clinic-article sentences verbatim into course handouts (his content, but
  wrong context + duplicate-content hygiene).
- **Ingestion mechanism** — clinic articles are fetched with a browser
  User-Agent via `curl`/server fetch (WebFetch is 403'd by the site's bot
  protection). Done once to build the profile, refreshed on demand; store the
  distilled profile, not full article dumps.
- **Owner edits are the final word on voice** — the editor step (your hand on the
  draft) is the ultimate voice check; the profile just gets the first draft close.

## 5. PDF rendering (`src/lib/pdf/collateral.ts`, Option A)

- Parse Markdown → render with `pdf-lib`: h1–h3, paragraphs, bullet/numbered/
  **checkbox** lists, simple tables, page breaks, brand header (logo) + footer
  (course title · page n · generated date).
- Brand tokens (ink `#13272b`, teal `#0b6b63`, gold `#b8860b`); embed the
  existing certificate font.
- `diagram` blocks → code-built SVG → raster to PNG (sharp) → embed.

## 6. Admin UX (`/admin/collateral`, site_admin-guarded)

1. List collateral per course (status chips).
2. **New** → course → scope → type → **Generate**.
3. Editor: Markdown textarea + live preview; **Regenerate** (whole or section),
   **Save draft**, **Publish**.
4. Publish writes the PDF + `course_resources` row; re-publish bumps `version`.

## 7. Image generation — decision

- **Process/flow/timeline diagrams:** code-generated SVG (deterministic, accurate,
  Workers-safe). Chosen.
- **Decorative imagery:** reuse the 15 committed illustrations.
- **AI raster (DALL·E / Gemini "Nano Banana"):** **deferred.** Unreliable for
  anatomy and in-image text; a wrong clinical diagram is a brand/liability risk.
  If a non-clinical decorative need arises, Nano Banana is the better choice and
  would be gated behind owner review. No image-gen API key needed for Phase 1.

## 8. Build order

- **P1a** — schema + additive migration (`course_collateral`) + admin list scaffold.
- **P1b** — `collateral.ts` generation + admin editor + draft save/regenerate.
- **P1c** — `pdf-lib` Markdown→PDF renderer + publish → R2 + `course_resources`
  wiring + student download surface.
- **P1d** — code-generated SVG diagrams (only if green-lit; else Phase 2).
- **Phase 2 (later):** glossary/practice-Qs types, richer layout via Cloudflare
  Browser Rendering (new binding/cost — needs approval), lesson-level scope.

## 8a. P1b owner feedback (2026-06-25) → next-phase work

Owner tried the generate→edit loop in prod. Verdict: "good start," but the
editor is rudimentary. Carry into P1c / Phase 2 polish:

- ✅ **Fixed immediately:** saved drafts were unreachable (no link back into the
  editor) — list titles now link to `/admin/collateral/[id]`.
- **Live Markdown preview** in the editor (side-by-side), so the owner sees the
  formatted result, not raw Markdown.
- **Draft management:** delete a draft; clearer list (created date, scope, model);
  maybe duplicate/rename.
- **PDF publish (P1c)** is the headline next step — branded PDF → R2 →
  `course_resources` → student download; "Publish" button is currently stubbed.
- Owner is **holding further voice/quality comments until the PDF phase** — judge
  the real artifact, not the textarea.

## 9. Dependencies

- **No new runtime dependencies for Phase 1** (`pdf-lib`, Anthropic SDK, `sharp`
  all already present).
- Browser Rendering (Phase 2) and any image-gen model would be **new deps/bindings
  → require owner approval** per the dependency policy.
- Needs `ANTHROPIC_API_KEY` in prod (already a planned secret).
