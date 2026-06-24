/**
 * Oregon CA renewal rules — the single source for the renewal-date checker.
 *
 * The DEADLINE rule (last day of the CA's birth month) is a platform assumption
 * already used by intake + the dashboard, and is pure date logic — safe to
 * compute. The HOUR requirements are REGULATORY figures: confirmed against the
 * OBCE Chiropractic Assistant page (oregon.gov/obce) — 6 hours of CE annually,
 * the same at first renewal and every year after, and each year's 6 hours must
 * include 1 hour of cultural competency and 2 hours of vitals training (per
 * OBCE, these topics are annual, not first-renewal-only).
 */
export const OREGON_CA_RENEWAL = {
  deadlineRule: "birth_month_last_day" as const,
  firstRenewalHours: 6 as number | null,
  subsequentRenewalHours: 6 as number | null,
  requirementsNote:
    "Each year's 6 hours must include 1 hour of cultural competency and 2 hours of vitals training." as
      | string
      | null,
} as const;

export type RenewalConfig = typeof OREGON_CA_RENEWAL;
