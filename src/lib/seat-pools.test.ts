import { describe, it, expect } from "vitest";
import { consumedSeats, summarizePool } from "@/lib/seat-pools";

// Compliance ethos: `seatsPurchased` is the only stored count; consumed and
// available are RECOMPUTED from assignment statuses. Only invited|active hold a
// seat; expired|revoked free it. available is clamped at 0.
describe("consumedSeats", () => {
  it("counts invited and active, ignores expired and revoked", () => {
    expect(
      consumedSeats([
        { status: "invited" },
        { status: "active" },
        { status: "active" },
        { status: "expired" },
        { status: "revoked" },
      ]),
    ).toBe(3);
  });

  it("is 0 with no assignments", () => {
    expect(consumedSeats([])).toBe(0);
  });

  it("is 0 when every assignment freed its seat", () => {
    expect(
      consumedSeats([{ status: "expired" }, { status: "revoked" }]),
    ).toBe(0);
  });
});

describe("summarizePool", () => {
  it("computes available = purchased − consumed", () => {
    expect(
      summarizePool(5, [{ status: "active" }, { status: "invited" }]),
    ).toEqual({ purchased: 5, consumed: 2, available: 3 });
  });

  it("never reports negative availability (oversubscribed pool)", () => {
    // e.g. seats were refunded/shrunk manually while assignments remain active.
    expect(
      summarizePool(1, [{ status: "active" }, { status: "active" }]),
    ).toEqual({ purchased: 1, consumed: 2, available: 0 });
  });

  it("a fresh empty pool has all seats available", () => {
    expect(summarizePool(3, [])).toEqual({
      purchased: 3,
      consumed: 0,
      available: 3,
    });
  });

  it("expired/revoked assignments do not consume", () => {
    expect(
      summarizePool(2, [
        { status: "active" },
        { status: "expired" },
        { status: "revoked" },
      ]),
    ).toEqual({ purchased: 2, consumed: 1, available: 1 });
  });
});
