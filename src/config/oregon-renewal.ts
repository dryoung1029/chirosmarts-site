/**
 * Oregon CA renewal rules — the single source for the renewal-date checker.
 *
 * The DEADLINE rule (last day of the CA's birth month) is a platform assumption
 * already used by intake + the dashboard, and is pure date logic — safe to
 * compute. The HOUR requirements are REGULATORY figures and are OWNER-SUPPLIED:
 * left null until provided, the checker shows a visible placeholder rather than
 * an invented number (compliance hard rule — never fabricate a regulatory claim).
 */
export const OREGON_CA_RENEWAL = {
  deadlineRule: "birth_month_last_day" as const,
  firstRenewalHours: null as number | null,
  subsequentRenewalHours: null as number | null,
  requirementsNote: null as string | null,
} as const;

export type RenewalConfig = typeof OREGON_CA_RENEWAL;
