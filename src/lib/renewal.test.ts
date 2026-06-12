import { describe, it, expect } from "vitest";
import { lastDayOfMonth, nextRenewalDeadline, requiredHours } from "./renewal";

describe("lastDayOfMonth", () => {
  it("handles 31/30/28/29-day months", () => {
    expect(lastDayOfMonth(2026, 1)).toBe(31);
    expect(lastDayOfMonth(2026, 4)).toBe(30);
    expect(lastDayOfMonth(2026, 2)).toBe(28);
    expect(lastDayOfMonth(2024, 2)).toBe(29); // leap year
  });
});

describe("nextRenewalDeadline", () => {
  const from = new Date(Date.UTC(2026, 5, 12)); // 2026-06-12

  it("returns this year's last day when the birth month is still ahead/current", () => {
    const r = nextRenewalDeadline(6, from); // June → June 30, 2026
    expect(r).toMatchObject({ year: 2026, month: 6, day: 30 });
    expect(r!.label).toBe("June 30, 2026");
  });

  it("rolls to next year when the birth month already passed this year", () => {
    const r = nextRenewalDeadline(4, from); // April → already passed → April 30, 2027
    expect(r).toMatchObject({ year: 2027, month: 4, day: 30 });
  });

  it("handles December and January", () => {
    expect(nextRenewalDeadline(12, from)).toMatchObject({ year: 2026, month: 12, day: 31 });
    expect(nextRenewalDeadline(1, from)).toMatchObject({ year: 2027, month: 1, day: 31 });
  });

  it("uses the correct leap-day for a February birth month", () => {
    const r = nextRenewalDeadline(2, new Date(Date.UTC(2024, 0, 1))); // Jan 1 2024 → Feb 29 2024
    expect(r).toMatchObject({ year: 2024, month: 2, day: 29 });
  });

  it("rejects invalid months", () => {
    expect(nextRenewalDeadline(0, from)).toBeNull();
    expect(nextRenewalDeadline(13, from)).toBeNull();
  });
});

describe("requiredHours", () => {
  it("selects first vs subsequent from config", () => {
    const cfg = { ...({} as any), firstRenewalHours: 6, subsequentRenewalHours: 12 };
    expect(requiredHours(true, cfg)).toBe(6);
    expect(requiredHours(false, cfg)).toBe(12);
  });
  it("returns null (placeholder) when owner figures are absent", () => {
    const cfg = { ...({} as any), firstRenewalHours: null, subsequentRenewalHours: null };
    expect(requiredHours(true, cfg)).toBeNull();
    expect(requiredHours(false, cfg)).toBeNull();
  });
});
