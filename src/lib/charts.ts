/**
 * Tiny server-rendered SVG charts — no dependency, no client JS.
 *
 * Each function returns an SVG markup string (render with `set:html`). Charts use
 * a viewBox and width:100% so they scale responsively. Values are passed in the
 * unit the caller formats (cents here); a `fmt` callback labels axes/legends.
 */

export interface Series {
  label: string;
  color: string;
  values: number[];
}

const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

/** Brand-aligned palette (teal, gold, slate, plus tints) for series/segments. */
export const CHART_COLORS = [
  "#0B6B63", // brand teal
  "#B8860B", // gold
  "#51646A", // slate
  "#2F8F85", // light teal
  "#C99A3A", // light gold
  "#8aa0a6", // muted
  "#13272B", // ink
  "#6BBFB5", // pale teal
];

function niceMax(v: number): number {
  if (v <= 0) return 1;
  const pow = Math.pow(10, Math.floor(Math.log10(v)));
  const n = v / pow;
  const step = n <= 1 ? 1 : n <= 2 ? 2 : n <= 5 ? 5 : 10;
  return step * pow;
}

/**
 * Multi-series line chart over shared x labels.
 */
export function lineChartSvg(opts: {
  xLabels: string[];
  series: Series[];
  fmt: (v: number) => string;
  height?: number;
}): string {
  const W = 720;
  const H = opts.height ?? 300;
  const padL = 64;
  const padR = 34; // room so the last x-label isn't clipped
  const padT = 16;
  const padB = 56; // room for x labels + legend
  const plotW = W - padL - padR;
  const plotH = H - padT - padB;
  const n = opts.xLabels.length;
  const maxRaw = Math.max(1, ...opts.series.flatMap((s) => s.values));
  const max = niceMax(maxRaw);
  const x = (i: number) => padL + (n === 1 ? plotW / 2 : (plotW * i) / (n - 1));
  const y = (v: number) => padT + plotH - (plotH * v) / max;

  const ticks = 4;
  let grid = "";
  for (let t = 0; t <= ticks; t++) {
    const v = (max * t) / ticks;
    const yy = y(v);
    grid += `<line x1="${padL}" y1="${yy.toFixed(1)}" x2="${W - padR}" y2="${yy.toFixed(1)}" stroke="#e3e8e7" stroke-width="1"/>`;
    grid += `<text x="${padL - 8}" y="${(yy + 3).toFixed(1)}" text-anchor="end" font-size="11" fill="#8aa0a6">${esc(opts.fmt(v))}</text>`;
  }

  let xlabels = "";
  opts.xLabels.forEach((lbl, i) => {
    xlabels += `<text x="${x(i).toFixed(1)}" y="${H - padB + 18}" text-anchor="middle" font-size="12" fill="#51646A">${esc(lbl)}</text>`;
  });

  let lines = "";
  opts.series.forEach((s) => {
    const pts = s.values.map((v, i) => `${x(i).toFixed(1)},${y(v).toFixed(1)}`).join(" ");
    lines += `<polyline fill="none" stroke="${s.color}" stroke-width="2.5" points="${pts}"/>`;
    s.values.forEach((v, i) => {
      lines += `<circle cx="${x(i).toFixed(1)}" cy="${y(v).toFixed(1)}" r="3.5" fill="${s.color}"/>`;
    });
  });

  let legend = "";
  let lx = padL;
  const ly = H - 12;
  opts.series.forEach((s) => {
    legend += `<rect x="${lx}" y="${ly - 9}" width="11" height="11" rx="2" fill="${s.color}"/>`;
    legend += `<text x="${lx + 16}" y="${ly}" font-size="12" fill="#51646A">${esc(s.label)}</text>`;
    lx += 22 + s.label.length * 7.2;
  });

  return `<svg viewBox="0 0 ${W} ${H}" width="100%" role="img" style="max-width:100%;height:auto">${grid}${lines}${xlabels}${legend}</svg>`;
}

/**
 * Stacked bar chart: one bar per category, segments stacked within.
 */
export function stackedBarSvg(opts: {
  categories: string[];
  segments: Series[]; // each segment has values per category
  fmt: (v: number) => string;
  height?: number;
}): string {
  const W = 720;
  const H = opts.height ?? 320;
  const padL = 64;
  const padR = 16;
  const padT = 16;
  const padB = 64;
  const plotW = W - padL - padR;
  const plotH = H - padT - padB;
  const nCat = opts.categories.length;
  const totals = opts.categories.map((_, ci) =>
    opts.segments.reduce((sum, s) => sum + (s.values[ci] ?? 0), 0),
  );
  const max = niceMax(Math.max(1, ...totals));
  const y = (v: number) => padT + plotH - (plotH * v) / max;
  const bandW = plotW / nCat;
  const barW = Math.min(90, bandW * 0.55);

  const ticks = 4;
  let grid = "";
  for (let t = 0; t <= ticks; t++) {
    const v = (max * t) / ticks;
    const yy = y(v);
    grid += `<line x1="${padL}" y1="${yy.toFixed(1)}" x2="${W - padR}" y2="${yy.toFixed(1)}" stroke="#e3e8e7" stroke-width="1"/>`;
    grid += `<text x="${padL - 8}" y="${(yy + 3).toFixed(1)}" text-anchor="end" font-size="11" fill="#8aa0a6">${esc(opts.fmt(v))}</text>`;
  }

  let bars = "";
  let xlabels = "";
  opts.categories.forEach((cat, ci) => {
    const cx = padL + bandW * ci + bandW / 2;
    let acc = 0;
    opts.segments.forEach((s) => {
      const v = s.values[ci] ?? 0;
      if (v <= 0) return;
      const yTop = y(acc + v);
      const yBot = y(acc);
      bars += `<rect x="${(cx - barW / 2).toFixed(1)}" y="${yTop.toFixed(1)}" width="${barW.toFixed(1)}" height="${(yBot - yTop).toFixed(1)}" fill="${s.color}"><title>${esc(s.label)}: ${esc(opts.fmt(v))}</title></rect>`;
      acc += v;
    });
    bars += `<text x="${cx.toFixed(1)}" y="${(y(acc) - 6).toFixed(1)}" text-anchor="middle" font-size="11" font-weight="700" fill="#13272B">${esc(opts.fmt(acc))}</text>`;
    xlabels += `<text x="${cx.toFixed(1)}" y="${H - padB + 20}" text-anchor="middle" font-size="12" fill="#51646A">${esc(cat)}</text>`;
  });

  // wrap legend across up to 2 rows
  let legend = "";
  let lx = padL;
  let ly = H - 26;
  opts.segments.forEach((s) => {
    const w = 22 + s.label.length * 6.6;
    if (lx + w > W - padR) {
      lx = padL;
      ly += 16;
    }
    legend += `<rect x="${lx}" y="${ly - 9}" width="11" height="11" rx="2" fill="${s.color}"/>`;
    legend += `<text x="${lx + 16}" y="${ly}" font-size="11.5" fill="#51646A">${esc(s.label)}</text>`;
    lx += w;
  });

  return `<svg viewBox="0 0 ${W} ${H}" width="100%" role="img" style="max-width:100%;height:auto">${grid}${bars}${xlabels}${legend}</svg>`;
}

/**
 * Bullet bar: a horizontal track showing `actual` against a `target`, with a
 * marker at `pace` (expected-to-date). All values share one unit; `fmt` labels.
 */
export function bulletSvg(opts: {
  actual: number;
  pace: number;
  target: number;
  fmt: (v: number) => string;
}): string {
  const W = 720;
  const H = 74;
  const padL = 8;
  const padR = 8;
  const trackY = 22;
  const trackH = 22;
  const trackW = W - padL - padR;
  const max = Math.max(1, opts.target, opts.actual, opts.pace);
  const w = (v: number) => (trackW * Math.max(0, v)) / max;
  const ahead = opts.actual >= opts.pace;
  const fill = ahead ? "#0B6B63" : "#B8860B";
  const paceX = padL + w(opts.pace);

  return `<svg viewBox="0 0 ${W} ${H}" width="100%" role="img" style="max-width:100%;height:auto">
    <rect x="${padL}" y="${trackY}" width="${trackW}" height="${trackH}" rx="5" fill="#eef2f1"/>
    <rect x="${padL}" y="${trackY}" width="${w(opts.actual).toFixed(1)}" height="${trackH}" rx="5" fill="${fill}"/>
    <line x1="${paceX.toFixed(1)}" y1="${trackY - 6}" x2="${paceX.toFixed(1)}" y2="${trackY + trackH + 6}" stroke="#13272B" stroke-width="2"/>
    <text x="${paceX.toFixed(1)}" y="${trackY - 9}" text-anchor="middle" font-size="11" fill="#13272B">expected ${esc(opts.fmt(opts.pace))}</text>
    <text x="${padL}" y="${trackY + trackH + 20}" font-size="12" fill="#0B6B63" font-weight="700">actual ${esc(opts.fmt(opts.actual))}</text>
    <text x="${(W - padR).toFixed(1)}" y="${trackY + trackH + 20}" text-anchor="end" font-size="12" fill="#51646A">full-year target ${esc(opts.fmt(opts.target))}</text>
  </svg>`;
}

/**
 * Paired horizontal bars per row: target (light) vs actual (solid).
 */
export function pairedBarsSvg(opts: {
  rows: { label: string; target: number; actual: number }[];
  fmt: (v: number) => string;
}): string {
  const W = 720;
  const rowH = 34;
  const padT = 8;
  const padB = 8;
  const H = padT + padB + opts.rows.length * rowH;
  const labelW = 180;
  const padR = 96;
  const trackX = labelW;
  const trackW = W - labelW - padR;
  const max = Math.max(1, ...opts.rows.flatMap((r) => [r.target, r.actual]));
  const w = (v: number) => (trackW * Math.max(0, v)) / max;

  let body = "";
  opts.rows.forEach((r, i) => {
    const yTop = padT + i * rowH;
    const tgtY = yTop + 6;
    const actY = yTop + 16;
    body += `<text x="0" y="${(yTop + rowH / 2 + 1).toFixed(1)}" font-size="12" fill="#13272B">${esc(r.label)}</text>`;
    body += `<rect x="${trackX}" y="${tgtY}" width="${w(r.target).toFixed(1)}" height="8" rx="3" fill="#cfe0dd"><title>Target: ${esc(opts.fmt(r.target))}</title></rect>`;
    body += `<rect x="${trackX}" y="${actY}" width="${w(r.actual).toFixed(1)}" height="8" rx="3" fill="#0B6B63"><title>Actual: ${esc(opts.fmt(r.actual))}</title></rect>`;
    body += `<text x="${W - padR + 6}" y="${(yTop + rowH / 2 + 4).toFixed(1)}" font-size="11" fill="#51646A">${esc(opts.fmt(r.actual))} / ${esc(opts.fmt(r.target))}</text>`;
  });

  return `<svg viewBox="0 0 ${W} ${H}" width="100%" role="img" style="max-width:100%;height:auto">${body}</svg>`;
}
