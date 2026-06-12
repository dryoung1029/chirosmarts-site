/**
 * Pure renewal-date logic for the public checker. Deadline = the next upcoming
 * last day of the CA's birth month. Hour requirements come from the owner-
 * supplied config (null → caller renders a placeholder). Unit-tested.
 */
import { OREGON_CA_RENEWAL, type RenewalConfig } from "@/config/oregon-renewal";

const MONTHS = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

/** Days in a given month (month is 1–12). Handles leap years. */
export function lastDayOfMonth(year: number, month1to12: number): number {
  // Day 0 of the next month = last day of this month.
  return new Date(Date.UTC(year, month1to12, 0)).getUTCDate();
}

/**
 * The next upcoming renewal deadline (last day of `birthMonth`) on or after
 * `from`. If this year's date has already passed, rolls to next year.
 * Returns a date-only result in UTC plus a display label.
 */
export function nextRenewalDeadline(
  birthMonth: number,
  from: Date = new Date(),
): { year: number; month: number; day: number; label: string } | null {
  if (!Number.isInteger(birthMonth) || birthMonth < 1 || birthMonth > 12) {
    return null;
  }
  // Compare on date-only (UTC) to avoid time-of-day / timezone drift.
  const today = Date.UTC(
    from.getUTCFullYear(),
    from.getUTCMonth(),
    from.getUTCDate(),
  );
  let year = from.getUTCFullYear();
  let day = lastDayOfMonth(year, birthMonth);
  if (Date.UTC(year, birthMonth - 1, day) < today) {
    year += 1;
    day = lastDayOfMonth(year, birthMonth);
  }
  return {
    year,
    month: birthMonth,
    day,
    label: `${MONTHS[birthMonth - 1]} ${day}, ${year}`,
  };
}

/**
 * Required CE hours for the CA's situation. First renewal vs subsequent may
 * differ. Returns the owner-supplied number or null (→ placeholder). Never
 * fabricates a figure.
 */
export function requiredHours(
  firstRenewal: boolean,
  cfg: RenewalConfig = OREGON_CA_RENEWAL,
): number | null {
  return firstRenewal ? cfg.firstRenewalHours : cfg.subsequentRenewalHours;
}
