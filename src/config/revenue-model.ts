/**
 * Revenue projection model (owner-editable).
 *
 * The projection stores projected UNITS per SKU per year, NOT dollar figures.
 * Revenue is computed at read time as `units × live DB price` (or the
 * `fallbackPriceCents` below for SKUs not yet in the catalog), so whenever a
 * course price changes — or a planned course is published with its real price —
 * the projection re-bases automatically. Actual sales are tracked separately in
 * the `sales` ledger and compared against these lines in `revenue-projection.ts`.
 *
 * Numbers are the reconciled 3-year model (see the projection analysis): the
 * Conservative/Base/Optimistic ladder is intentionally monotonic. To re-forecast,
 * edit the `units` arrays (one entry per projection year). To re-anchor the
 * timeline, change `startDateIso`. Everything downstream follows.
 */

export type Scenario = "conservative" | "base" | "optimistic";
export const SCENARIOS: Scenario[] = ["conservative", "base", "optimistic"];
export const SCENARIO_LABEL: Record<Scenario, string> = {
  conservative: "Conservative (floor)",
  base: "Base (expected)",
  optimistic: "Optimistic (upside)",
};

/** How many projection years the model spans. */
export const MODEL_YEARS = 3;

export interface ModelLine {
  key: string;
  label: string;
  /** Resolve the live unit price from this course slug when it exists. */
  courseSlug: string;
  /** Used when the course isn't in the catalog yet (e.g. Suicide Prevention). */
  fallbackPriceCents: number;
  /** B2C direct vs clinic B2B — used to bucket actual sales onto this line. */
  channel: "direct" | "clinic";
  /** True for annually-repeating CE (drives the recurring-revenue framing). */
  recurring?: boolean;
  /** Projected units per projection year, per scenario. Length = MODEL_YEARS. */
  units: Record<Scenario, number[]>;
}

export interface RevenueModel {
  /** Start of projection Year 1 (UTC ISO date). Year N = [start+«N-1»y, start+Ny). */
  startDateIso: string;
  /** Prior-year actuals, shown for context (not part of the projected years). */
  baseline: { label: string; revenueCents: number; units: number; note: string };
  lines: ModelLine[];
}

/**
 * CALIBRATION NOTE (from the imported 11-year Gravity Forms history):
 *  - The $99 initial cert generated $68.4k gross lifetime (691 paid, 666 unique
 *    buyers), but volume PEAKED at 134/yr in 2022 and has DECLINED to ~55/yr
 *    (trailing 12 mo) — roughly half. So initial-cert units are modeled flat-to-
 *    modest, NOT growing off a peak: the new platform's job is to stabilize and
 *    reverse the slide, with the $99→$149 price doing most of the Year-1 lift.
 *  - The old site sold almost NO repeat purchases (only 22 buyers ever bought
 *    twice) — the entire renewal/CE flywheel is greenfield. But there is now a
 *    warm list of ~1,800 prior contacts (free-CEU signups + buyers) to activate,
 *    so the recurring lines ramp a touch faster than a cold start would.
 */
export const REVENUE_MODEL: RevenueModel = {
  startDateIso: "2026-07-01",
  baseline: {
    label: "Trailing 12 mo (old site)",
    revenueCents: 544500, // 55 paid × $99
    units: 55,
    note: "55 paid certifications at $99 — down from a 2022 peak of 134/yr; the cert line has been declining.",
  },
  lines: [
    {
      key: "initial",
      label: "Initial CA Certification",
      courseSlug: "oregon-ca-initial",
      fallbackPriceCents: 14900,
      channel: "direct",
      // Flat-to-modest: stabilize the decline; price ($99→$149) is the real lift.
      units: {
        conservative: [55, 54, 54],
        base: [66, 68, 70],
        optimistic: [82, 95, 110],
      },
    },
    {
      key: "renewal_bundle",
      label: "Annual Renewal Bundle (6 hr)",
      courseSlug: "annual-renewal-bundle",
      fallbackPriceCents: 8900,
      channel: "direct",
      recurring: true,
      // Greenfield, but seeded by the ~1,800-contact warm list + reminders.
      units: {
        conservative: [18, 38, 60],
        base: [30, 55, 85],
        optimistic: [120, 210, 300],
      },
    },
    {
      key: "suicide_prevention",
      label: "Suicide Prevention CE",
      courseSlug: "suicide-prevention", // not in the catalog yet — uses fallback price
      fallbackPriceCents: 3400,
      channel: "direct",
      recurring: true,
      units: {
        conservative: [3, 10, 20],
        base: [6, 18, 34],
        optimistic: [20, 140, 240],
      },
    },
    {
      key: "cultural_competency",
      label: "Cultural Competency (standalone)",
      courseSlug: "cultural-competency",
      fallbackPriceCents: 2900,
      channel: "direct",
      recurring: true,
      units: {
        conservative: [10, 18, 26],
        base: [14, 26, 38],
        optimistic: [70, 95, 120],
      },
    },
    {
      key: "vitals",
      label: "Vitals (standalone)",
      courseSlug: "vitals-monitoring",
      fallbackPriceCents: 3900,
      channel: "direct",
      recurring: true,
      units: {
        conservative: [8, 12, 16],
        base: [10, 18, 26],
        optimistic: [55, 75, 95],
      },
    },
    {
      key: "hipaa",
      label: "HIPAA Essentials",
      courseSlug: "hipaa-essentials",
      fallbackPriceCents: 3500,
      channel: "direct",
      units: {
        conservative: [10, 16, 20],
        base: [12, 20, 26],
        optimistic: [40, 60, 78],
      },
    },
    {
      key: "cbt",
      label: "CBT in Chiropractic Practice",
      courseSlug: "cbt-chiropractic-practice",
      fallbackPriceCents: 4900,
      channel: "direct",
      units: {
        conservative: [5, 8, 12],
        base: [6, 10, 14],
        optimistic: [28, 45, 62],
      },
    },
    {
      key: "clinic_seats",
      label: "Clinic seat pools (B2B)",
      courseSlug: "__clinic__", // synthetic: any clinic-channel sale maps here
      fallbackPriceCents: 12000, // blended seat ACV
      channel: "clinic",
      // ~450 enumerable clinics from the imported list feed the postcard mailer.
      units: {
        conservative: [4, 12, 22],
        base: [8, 18, 30],
        optimistic: [36, 90, 165],
      },
    },
  ],
};
