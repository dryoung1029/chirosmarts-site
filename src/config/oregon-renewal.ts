/**
 * Oregon CA renewal rules — the single source for the renewal-date checker.
 *
 * The DEADLINE rule (last day of the CA's birth month) is a platform assumption
 * already used by intake + the dashboard, and is pure date logic — safe to
 * compute. The HOUR requirements are REGULATORY figures: confirmed against the
 * OBCE Chiropractic Assistant page (oregon.gov/obce) — 6 hours of CE annually,
 * both at first renewal and every year after. The topic breakdown (cultural
 * competency, vitals) lives in `requirementsNote`; held null until the owner
 * confirms whether the 2 vitals hours are first-renewal-only or annual.
 */
export const OREGON_CA_RENEWAL = {
  deadlineRule: "birth_month_last_day" as const,
  firstRenewalHours: 6 as number | null,
  subsequentRenewalHours: 6 as number | null,
  requirementsNote: null as string | null,
} as const;

export type RenewalConfig = typeof OREGON_CA_RENEWAL;
