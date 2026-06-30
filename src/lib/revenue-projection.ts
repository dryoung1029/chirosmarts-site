/**
 * Revenue projection engine.
 *
 * Joins the units-based projection model (`config/revenue-model.ts`) to LIVE
 * course prices from the DB, and to ACTUAL sales from the `sales` ledger, to
 * produce a scenario forecast plus current-year pace tracking. Because revenue
 * is always `projected units × current price`, changing a course price (or
 * publishing a planned course) re-bases the forecast with no edits here.
 */
import { eq } from "drizzle-orm";
import type { Db } from "@/db/client";
import { schema } from "@/db/client";
import {
  REVENUE_MODEL,
  MODEL_YEARS,
  SCENARIOS,
  type Scenario,
  type ModelLine,
} from "@/config/revenue-model";
import { getSalesInRange } from "@/lib/sales";

function addYears(iso: string, n: number): string {
  const d = new Date(iso);
  d.setUTCFullYear(d.getUTCFullYear() + n);
  return d.toISOString();
}

export interface YearWindow {
  index: number; // 0-based projection year
  label: string; // "Year 1" …
  startIso: string;
  endIso: string;
}

/** The MODEL_YEARS projection-year windows. */
export function projectionYears(): YearWindow[] {
  const out: YearWindow[] = [];
  for (let y = 0; y < MODEL_YEARS; y++) {
    out.push({
      index: y,
      label: `Year ${y + 1}`,
      startIso: addYears(REVENUE_MODEL.startDateIso, y),
      endIso: addYears(REVENUE_MODEL.startDateIso, y + 1),
    });
  }
  return out;
}

export interface CurrentYear {
  index: number; // -1 before launch, 0..MODEL_YEARS-1 active, clamped to last after
  label: string;
  elapsedFraction: number; // 0..1 through the current year
  preLaunch: boolean;
  ended: boolean;
  window: YearWindow | null;
}

export function currentYear(nowMs = Date.now()): CurrentYear {
  const years = projectionYears();
  const startMs = new Date(REVENUE_MODEL.startDateIso).getTime();
  const endMs = new Date(years[years.length - 1].endIso).getTime();
  if (nowMs < startMs) {
    return { index: -1, label: "Pre-launch", elapsedFraction: 0, preLaunch: true, ended: false, window: null };
  }
  if (nowMs >= endMs) {
    const w = years[years.length - 1];
    return { index: w.index, label: w.label, elapsedFraction: 1, preLaunch: false, ended: true, window: w };
  }
  for (const w of years) {
    const ws = new Date(w.startIso).getTime();
    const we = new Date(w.endIso).getTime();
    if (nowMs >= ws && nowMs < we) {
      return {
        index: w.index,
        label: w.label,
        elapsedFraction: (nowMs - ws) / (we - ws),
        preLaunch: false,
        ended: false,
        window: w,
      };
    }
  }
  // unreachable
  return { index: 0, label: years[0].label, elapsedFraction: 0, preLaunch: false, ended: false, window: years[0] };
}

/** Resolve each model line's current unit price (live DB price, else fallback). */
export async function resolveLinePrices(db: Db): Promise<Map<string, { priceCents: number; live: boolean }>> {
  const out = new Map<string, { priceCents: number; live: boolean }>();
  for (const line of REVENUE_MODEL.lines) {
    let priceCents = line.fallbackPriceCents;
    let live = false;
    if (line.courseSlug && !line.courseSlug.startsWith("__")) {
      const c = await db
        .select({ priceCents: schema.courses.priceCents })
        .from(schema.courses)
        .where(eq(schema.courses.slug, line.courseSlug))
        .get();
      if (c) {
        priceCents = c.priceCents;
        live = true;
      }
    }
    out.set(line.key, { priceCents, live });
  }
  return out;
}

export interface LineYear {
  units: number;
  revenueCents: number;
}
export interface LineProjection {
  line: ModelLine;
  priceCents: number;
  livePrice: boolean;
  byScenario: Record<Scenario, LineYear[]>; // one LineYear per projection year
}

export interface ScenarioTotals {
  perYearRevenueCents: number[];
  threeYearRevenueCents: number;
}

export interface ActualBucket {
  units: number;
  revenueCents: number;
}

export interface ProjectionResult {
  startDateIso: string;
  years: YearWindow[];
  current: CurrentYear;
  baseline: typeof REVENUE_MODEL.baseline;
  lines: LineProjection[];
  totals: Record<Scenario, ScenarioTotals>;
  /** Actuals for the current projection year, bucketed by model line key. */
  actualByLine: Record<string, ActualBucket>;
  actualTotal: ActualBucket;
  /** Sum of `base` projected revenue for the current year (full year). */
  currentYearBaseRevenueCents: number;
  /** Expected-to-date = base full-year × elapsedFraction. */
  currentYearPacedRevenueCents: number;
}

/** Map a sale row to a model line key (clinic channel → clinic line; else slug). */
function lineKeyForSlug(slugToKey: Map<string, string>, channel: string, slug: string | null): string {
  if (channel === "clinic") return "clinic_seats";
  if (slug && slugToKey.has(slug)) return slugToKey.get(slug)!;
  return "__other__";
}

export async function buildProjection(db: Db, nowMs = Date.now()): Promise<ProjectionResult> {
  const prices = await resolveLinePrices(db);
  const years = projectionYears();
  const current = currentYear(nowMs);

  const lines: LineProjection[] = REVENUE_MODEL.lines.map((line) => {
    const price = prices.get(line.key)!;
    const byScenario = {} as Record<Scenario, LineYear[]>;
    for (const s of SCENARIOS) {
      byScenario[s] = line.units[s].map((u) => ({
        units: u,
        revenueCents: u * price.priceCents,
      }));
    }
    return { line, priceCents: price.priceCents, livePrice: price.live, byScenario };
  });

  const totals = {} as Record<Scenario, ScenarioTotals>;
  for (const s of SCENARIOS) {
    const perYear = years.map((_, yi) =>
      lines.reduce((sum, lp) => sum + lp.byScenario[s][yi].revenueCents, 0),
    );
    totals[s] = {
      perYearRevenueCents: perYear,
      threeYearRevenueCents: perYear.reduce((a, b) => a + b, 0),
    };
  }

  // Actuals for the current projection year (or empty before launch).
  const slugToKey = new Map<string, string>();
  for (const line of REVENUE_MODEL.lines) {
    if (line.courseSlug && !line.courseSlug.startsWith("__")) slugToKey.set(line.courseSlug, line.key);
  }
  const actualByLine: Record<string, ActualBucket> = {};
  const actualTotal: ActualBucket = { units: 0, revenueCents: 0 };
  if (current.window) {
    // Resilient: if the ledger table doesn't exist yet (migration not applied),
    // fall back to zero actuals so the forecast still renders.
    const rows = await getSalesInRange(db, current.window.startIso, current.window.endIso).catch(
      () => [] as Awaited<ReturnType<typeof getSalesInRange>>,
    );
    for (const r of rows) {
      const key = lineKeyForSlug(slugToKey, r.channel, r.skuSlug);
      const b = (actualByLine[key] ??= { units: 0, revenueCents: 0 });
      b.revenueCents += r.amountCents;
      actualTotal.revenueCents += r.amountCents;
      const q = r.kind === "refund" ? -r.quantity : r.kind === "sale" ? r.quantity : 0;
      b.units += q;
      actualTotal.units += q;
    }
  }

  const yi = current.index >= 0 ? current.index : 0;
  const currentYearBaseRevenueCents = totals.base.perYearRevenueCents[yi] ?? 0;
  const currentYearPacedRevenueCents = Math.round(
    currentYearBaseRevenueCents * current.elapsedFraction,
  );

  return {
    startDateIso: REVENUE_MODEL.startDateIso,
    years,
    current,
    baseline: REVENUE_MODEL.baseline,
    lines,
    totals,
    actualByLine,
    actualTotal,
    currentYearBaseRevenueCents,
    currentYearPacedRevenueCents,
  };
}

/** $X,XXX from cents (whole dollars). */
export function fmtUsd(cents: number): string {
  const neg = cents < 0;
  const dollars = Math.round(Math.abs(cents) / 100);
  return `${neg ? "−" : ""}$${dollars.toLocaleString("en-US")}`;
}
