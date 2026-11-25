# ChiroSmarts — Marketing Campaign Plan (Always-On)

> **Author:** planning session, 2026-11-24 · **Owner:** Dr. Jason Young, DC
> **Status:** PLAN. **Updated 2026-11-25** after owner review — corrected catalog/infra facts below (Stripe is LIVE, Cultural Competency is LIVE, renewal reminders already ship). First action taken: re-permission email drafted in Brevo (campaign ID 16, Past Buyers list, **not sent**).

## 0. The brief (decisions locked this session)

| Lever | Decision |
|---|---|
| **Primary goal / KPI** | **Course enrollments & revenue** |
| **Audience** | **All audiences, weighted to the flagship** $149 initial certification |
| **Budget** | **Modest paid — under $500/mo** (organic core + targeted search/social) |
| **Timeframe** | **Always-on / evergreen** (durable funnels + automations, not a dated burst) |

### What we can actually sell today (grounded in the catalog)
| Course | Hours | Price | Status | Campaign role |
|---|---|---|---|---|
| **Oregon CA — Initial Certification** | 8 | **$149** | ✅ published | **Hero offer** — the money-maker |
| **Vitals Monitoring** | 2 | **$39** | ✅ published | Renewal entry + add-on |
| **HIPAA Essentials** | 1 | **$35** | ✅ published | Renewal add-on + clinic staff training |
| Cultural Competency | 1 | $29 | ✅ LIVE (two courses) | Required annual renewal hour |
| Suicide intervention | — | — | ⏳ ~1–2 weeks out | Completes the renewal bundle |
| CBT in Chiropractic | — | $49 | 🚧 draft | future |
| Annual Renewal Bundle | 6 | $89 | 🚧 draft | *the renewal money offer — blocked until published* |

> **Renewal status (corrected):** Oregon renewal needs **6 hrs/yr including 1 hr cultural competency every year**. We now sell Vitals + HIPAA + Cultural Competency live. The **suicide-intervention module (~1–2 weeks out) completes the full 6-hr renewal bundle** — bundling it is the near-term revenue unlock for the renewal track. Compliance renewal reminders already ship (in-app Resend, see §8a), so the retention loop is live.

---

## 1. Positioning & core message

**One-line promise:** *The fastest honest way to become (and stay) a certified Oregon Chiropractic Assistant — do the required hours online in days, with automatic hour-tracking and an instantly verifiable certificate.*

**Why us (proof points to use everywhere):**
- **Built for Oregon specifically** — maps to OBCE requirements, not generic CA content.
- **Compliance you can trust** — real seat-time tracking, a final exam, and a **publicly verifiable certificate** (`/verify`). This is a differentiator vs. "watch a video, print a PDF" competitors, and it's literally what a licensing board wants.
- **Taught by a practicing DC** — Dr. Jason Young (credibility; needs bio/photo — see §9).
- **Finish in days, not weeks** — self-paced, resume where you left off.

**Tone:** Dr. Young's own voice (there's a `voice-profile` skill — all student-facing copy should be checked against it before publishing).

---

## 2. Offers & average-order-value plays (within the published catalog)

The goal is revenue, so lift AOV without discounting the flagship:

1. **Flagship, full price ($149).** Don't discount the initial cert; it's high-intent, low-alternative. Use urgency from *their* timeline ("start your clinic job sooner"), not price cuts.
2. **Smart add-on at checkout / post-purchase:** offer **HIPAA ($35)** to initial-cert buyers — new CAs will need it and clinics expect it. One-click add raises AOV ~23% with no new traffic.
3. **Renewal starter ($39 Vitals, $35 HIPAA)** as the entry wedge for already-certified CAs — low price = low-friction first purchase, then nurture to the full bundle once it ships.
4. **Clinic bulk (B2B):** seat pools already exist (Phase 4). Pitch clinics "train your whole front desk" — volume, not discount. (See §5 clinic track.)
5. **Founding-reviews loop:** early buyers → request a testimonial (system exists) → fuel social proof on course pages. Revenue compounds as proof grows.

---

## 3. Funnel map (what already exists → what to light up)

```
            AWARENESS                 CONSIDERATION            CONVERSION          RETENTION/EXPAND
  Google/Meta ads ─┐
  Guides (SEO) ────┼─► /courses, /courses/[slug] ─► free Module 1 preview ─► Stripe checkout ─► welcome flow
  Blog + social ───┘        guides/[slug]              lead magnet (checklist)      ($149/$39/$35)      │
  Clinic outreach ─────────► /clinics ──────────────► seat quote ───────────────────────────────────► renewal
  Referrals/QR ────────────► lead capture (double opt-in) ─► Brevo nurture ─────────────────────────► reminders
```

Every box except the **paid ads**, the **Brevo nurture/automations**, and **clinic outreach** is already built. The campaign is mostly about *turning on and feeding* the engine that exists.

---

## 4. Audience tracks

### Track A — New CAs → Initial Certification ($149) **[primary, ~60% of effort]**
- **Who:** people taking a front-desk/CA job at an Oregon chiropractic clinic; career-changers; clinic new-hires told "go get certified."
- **Intent is high and searchable.** This is where paid search earns its keep.
- **Hook content:** guide `become-a-chiropractic-assistant-oregon` (already live) → course page → free Module 1 preview → checkout.
- **Lead magnet:** the "How to become an Oregon CA" checklist (lead capture exists; **PDF asset is still a placeholder — see §9**).

### Track B — Renewing CAs → CE ($39/$35, bundle $89 when live) **[secondary, ~25%]**
- **Who:** certified CAs with an annual renewal keyed to their **birth month** — so this is an *always-on, evergreen* drip, not a one-time blast.
- **Killer asset:** the **renewal-date checker** on `/renewal` — capture email, then **automate a reminder ~45–60 days before their renewal month**.
- **Blocked at full power** until Cultural Competency + Bundle publish (§9). Until then, sell Vitals + HIPAA and collect renewal-month leads for later.

### Track C — Clinic owners (DCs) → bulk seats **[secondary, ~15%]**
- **Who:** the DCs who employ CAs. One sale = multiple seats + recurring renewals.
- **Channel:** direct outreach (email/LinkedIn), `/clinics` page, and physical collateral in clinics (QR codes via Bitly).
- **Pitch:** "Onboard and keep your CAs compliant without managing it yourself — buy seats, invite staff, see progress."

---

## 5. The always-on channel engine

### 5.1 SEO + content (the evergreen foundation — compounds, $0)
- **Guides** are the SEO backbone. Two exist; **add 4–6 more** targeting real searches:
  - "Oregon chiropractic assistant requirements 2027"
  - "How much does Oregon CA certification cost / how long does it take"
  - "Oregon CA renewal checklist / CE hours required"
  - "Chiropractic assistant vs medical assistant Oregon"
  - "Do Oregon chiropractic assistants need HIPAA training"
  - "Vitals a CA must know (BP, pulse, resp, temp)"
- Each guide ends in the existing related-course card → course page. Article JSON-LD already wired.
- **Blog** (system exists): lighter, shareable posts + announcements; cross-link to guides.
- **Set `lastUpdated` dates** on guides (freshness = ranking; currently omitted — §9).

### 5.2 Email / Brevo (the conversion & retention core)
Transactional stays on Resend (magic links, receipts, certs). **Marketing lives in Brevo.** Lead capture + double opt-in + manual Brevo sync already exist; **no campaigns/automations are built yet.** Build these as **drafts** for owner approval:

1. **Lead nurture (initial-cert intent):** 3–4 email sequence after checklist download → value → free preview → enroll. (Drafts already exist in `docs/marketing/email-1..3.html` — adapt.)
2. **Abandoned-preview / abandoned-checkout:** started Module 1 or hit checkout but didn't buy → 1–2 nudges.
3. **Renewal reminder automation (Track B):** triggered off birth-month → fires ~45 days out. *This is the single most valuable automation for lifetime value.*
4. **Post-purchase:** welcome (exists) → at completion, request a review → suggest the next course (HIPAA/renewal).
5. **Re-permission / win-back:** `docs/marketing/re-permission-emails.md` already drafted for any imported WordPress list.

### 5.3 Paid — under $500/mo (high-intent first)
Suggested monthly split (validate and shift to whatever converts):
- **~$300 Google Search** — exact/phrase high-intent terms: *"oregon chiropractic assistant certification," "oregon CA training," "oregon chiropractic assistant renewal," "oregon CA CE hours."* Tiny, cheap, high-intent niche. Point ads at the **matching course/guide page**, not the homepage.
- **~$150 Meta/Instagram** — mostly **retargeting** site visitors + a small lookalike/interest prospecting test (chiropractic clinics, medical-assistant-curious, Oregon geo). Creative uses the illustrations already in the repo.
- **~$50 reserve** for boosting the best-performing organic post / A-B creative.
- **Illustrative unit economics:** ~$3 CPC × $300 ≈ 100 clicks; at 5–10% course-page→buy ≈ **5–10 initial-cert sales ($745–$1,490)** from that spend. Target blended **CAC < ~$40** against a $149 flagship. Watch it weekly; kill losers fast.

### 5.4 Clinic B2B (Track C)
- Build a simple **prospect list** of Oregon chiropractic clinics (public directories/Google Maps).
- Short, personal outreach from Dr. Young (peer-to-peer DC credibility), linking `/clinics`.
- **Physical collateral in clinics:** a one-page flyer / counter card (Collateral Studio can generate PDFs) with a **Bitly QR** → `/courses/oregon-ca-initial`, so new hires self-enroll. Each clinic gets its own tracked short link.

### 5.5 Referrals & social proof
- Ask every certificate-earner for a testimonial (system exists) and a referral.
- Consider a simple "refer a coworker" ask in the post-cert email.

---

## 6. Tracking & measurement (so "always-on" is steerable)

**You can't optimize what you don't measure. Instrument before spending.**
- **UTMs on every link** + **Bitly** short links for anything offline/social (Bitly analytics + QR scans). One link per channel/campaign.
- **Cloudflare Web Analytics** (set `CF_WEB_ANALYTICS_TOKEN`) + the existing first-party pageview beacon on public pages.
- **First-party funnel events already logged** (`lead_captured`, `lead_confirmed`, enrollment, `terms_accepted`, etc.) — build a tiny admin view (or reuse metrics) for: visits → previews started → leads → enrollments.

**KPIs (set baselines in week 1, then targets):**
| Stage | Metric | Starting target (validate) |
|---|---|---|
| Acquisition | Sessions, cost/click | track |
| Lead | Checklist opt-ins (confirmed) | 15–25% of guide visitors |
| Activation | Free Module 1 previews started | track |
| **Conversion** | **Preview→paid enrollment** | **5–10%** |
| Revenue | Enrollments, AOV, ROAS | ROAS > 3× on paid |
| Retention | Renewal-reminder → repurchase | build baseline |

---

## 7. Cadence (evergreen with light seasonal beats)

- **Weekly:** 1 blog/social post; review paid performance + reallocate; respond to leads.
- **Bi-weekly:** 1 new SEO guide (front-load the 6 above over the first ~3 months).
- **Monthly:** email to opted-in list (new content, tips, a soft offer); refresh ad creative; clinic outreach batch.
- **Automated/continuous:** renewal reminders (birth-month triggered), nurture, abandoned-checkout, post-purchase.
- **Seasonal lift (no code):** Jan–Mar "new year, new career" push on Track A (new-CA intent peaks); year-end "use your renewal window" nudge on Track B.

---

## 8. Priority action list (first 2 weeks)

1. **Clear the revenue blockers in §9** (Stripe live mode is non-negotiable for an enrollments goal).
2. **Set up tracking:** CF analytics token, UTM convention, Bitly links for each channel.
3. **Turn on Brevo:** keys + list IDs; wire the manual sync; build the **lead-nurture** and **renewal-reminder** automations as **drafts** for your approval.
4. **Finish the lead magnet** (the checklist PDF) so Track A's capture actually delivers something.
5. **Publish 2 more guides** from the §5.1 list; add `lastUpdated` dates to all.
6. **Launch a tiny Google Search test** ($10/day) on 3–4 exact-match terms → course page.
7. **Draft the clinic flyer** (Collateral Studio) + per-clinic Bitly QR; start a 10-clinic outreach batch.
8. **Decide on publishing Cultural Competency + the Renewal Bundle** to unlock Track B at full power.

---

## 8a. Retention — renewal reminders (ALREADY LIVE)

Per architecture, renewal reminders are **compliance email via Resend**, not Brevo. This is **already built and deployed** (`src/lib/flows.ts` → `src/pages/api/cron/flows.ts`):
- Fires **≤60 days before** each certified CA's birth-month renewal, **once per cycle**, idempotent (keyed `flow_email` events, never double-sent).
- Guards: only **certified** users, and not **freshly** certified (≥300-day cert age) — so new students aren't mistaken for renewers.
- Covers account holders **and** legacy imported certified contacts who set their birth month.
- Triggered daily by GitHub Actions (`.github/workflows/cron.yml`, 16:00 UTC) → `/api/cron/flows` (authed by `CRON_SECRET`). Endpoint confirmed live in prod (401 without key).
- **Verify:** run the `cron` workflow manually (target: flows) and confirm `ok:true`.

## 9. Blockers & owner actions (honest list — these gate real revenue)

*Resolved since first draft: Stripe is LIVE (daily transactions); Cultural Competency is LIVE; renewal reminders are built, wired (GitHub Actions daily tick → `/api/cron/flows`), and deployed.*

| # | Open item | Why it matters | Owner action |
|---|---|---|---|
| 1 | **Full 6-hr Renewal Bundle** awaits the suicide-intervention module (~1–2 wks) | The highest-AOV renewal offer | Publish module → publish bundle |
| 2 | **Brevo app-sync not wired** (lists + attributes + `BREVO_LIST_ID_*`) | New leads/students won't flow into Brevo lists automatically | See §9a wiring checklist |
| 3 | **Lead-magnet checklist PDF is a placeholder** | Track A capture promises an asset it can't deliver | Supply/approve the PDF (store in R2) |
| 4 | **Legal `effectiveDate` + `[VERIFY]` flags pending** | Terms/Privacy must be clean before paid traffic | Confirm legal copy + date |
| 5 | **Instructor bio/photo + guide dates missing** | Credibility + SEO freshness | Provide bio, photo, dates |
| 6 | **Cloudflare analytics token unset** | Campaign is flying blind | Set `CF_WEB_ANALYTICS_TOKEN` |
| 7 | **Verify the renewal cron is actually ticking** | Confirms reminders send in prod | Run the `cron` GitHub Action (flows) manually → expect `ok:true` |

---

## 9a. Brevo app-sync wiring checklist (so leads/students flow automatically)

The ChiroSmarts Brevo account already holds **Past Buyers (666)**, **Oregon Chiropractic Clinics (88)**, and **Newsletter (6)** — plenty to campaign to now. What's NOT yet wired is the app's ongoing push of new confirmed leads + opted-in students into Brevo. `src/lib/brevo.ts` upserts contacts into lists chosen by env vars and sets attributes `ROLE`, `BIRTH_MONTH`, `CLINIC`, `SOURCE` — **none of which exist in the account yet**. The Brevo connector here can't create lists/attributes/contacts (only campaigns/automations/templates), so these are owner clicks in Brevo + Cloudflare:

1. **Create two lists** in Brevo (Newsletter already exists = list 8): **ChiroSmarts Students** and **ChiroSmarts Leads**. Note their numeric IDs.
2. **Create four contact attributes** (Contacts → Settings → Attributes): `ROLE` (text), `BIRTH_MONTH` (number), `CLINIC` (text), `SOURCE` (text).
3. **Set env vars in Cloudflare Pages** (Settings → Env vars, then redeploy — Pages applies them on next deploy): `BREVO_API_KEY`, `BREVO_LIST_ID_NEWSLETTER=8`, `BREVO_LIST_ID_LEADS=<Leads id>`, `BREVO_LIST_ID_USERS=<Students id>`.
4. **Backfill:** Admin → overview → **Sync to Brevo** pushes existing confirmed leads + opted-in users. New ones sync in real time thereafter (`syncLeadToBrevo` / `syncUserToBrevo`).

## 10. What I can build next (just say which)

- Draft the **Brevo nurture + renewal-reminder automations** (as drafts, grounded in the real catalog) via the Brevo connector.
- Write the **4–6 new SEO guides** (checked against the voice profile) + commit them to `src/content/guides/`.
- Generate **Bitly tracked links + QR codes** per channel/clinic.
- Draft the **Google/Meta ad copy + keyword list** and the clinic outreach email.
- Build a small **funnel dashboard** off the existing events.
- Adapt the existing `docs/marketing/email-*.html` drafts into the live sequences.

> This is a plan, not a launch. No emails, ads, or Brevo changes have been made. Pick the pieces you want and I'll execute them one at a time.
