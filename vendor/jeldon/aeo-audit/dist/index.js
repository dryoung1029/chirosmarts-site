// src/run.ts
function parseCitations(urls, responseText, brand) {
  const totalCitations = urls.length;
  const needle = brand.url.toLowerCase();
  let citationRank = null;
  for (let i = 0; i < urls.length; i++) {
    const u = urls[i];
    if (u && needle && u.toLowerCase().includes(needle)) {
      citationRank = i + 1;
      break;
    }
  }
  const lowerText = (responseText || "").toLowerCase();
  const brandMentioned = brand.mentions.some((m) => m && lowerText.includes(m.toLowerCase()));
  return {
    cited: citationRank !== null,
    citationRank,
    totalCitations,
    brandMentioned
  };
}
async function sha256(s) {
  const buf = new TextEncoder().encode(s);
  const hashBuf = await crypto.subtle.digest("SHA-256", buf);
  return Array.from(new Uint8Array(hashBuf)).map((b) => b.toString(16).padStart(2, "0")).join("").slice(0, 16);
}
function dateKey(d = /* @__PURE__ */ new Date(), timezone = "America/Los_Angeles") {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  }).format(d);
}
async function runQuery(query, engines, brand) {
  const result = { queryId: query.id, engines: {} };
  await Promise.all(
    engines.map(async (eng) => {
      try {
        const raw = await eng.fn(query.query);
        if (raw.error) {
          result.engines[eng.name] = { error: raw.error };
          return;
        }
        const urls = raw.urls ?? [];
        const parsed = parseCitations(urls, raw.text ?? "", brand);
        result.engines[eng.name] = {
          ...parsed,
          // Don't store the full response text — hash it for change detection.
          responseHash: await sha256(raw.text ?? ""),
          urlsCount: urls.length,
          // Distinguishes "AIO present but didn't cite us" (cited:false,
          // noAiOverview:false) from "no AIO surfaced at all".
          ...raw.noAiOverview ? { noAiOverview: true } : {}
        };
      } catch (err) {
        result.engines[eng.name] = { error: err instanceof Error ? err.message : String(err) };
      }
    })
  );
  return result;
}
async function runAudit(querySet, engines, opts) {
  const results = [];
  for (const q of querySet) {
    opts.onProgress?.(q.id);
    results.push(await runQuery(q, engines, opts.brand));
  }
  return {
    date: dateKey(opts.now, opts.timezone),
    engines: engines.map((e) => e.name),
    queryCount: querySet.length,
    results
  };
}

// src/aggregate.ts
function hasNoAiOverview(e) {
  return !!e && !!e.noAiOverview;
}
function aggregate(store, opts) {
  const queries = opts.queries;
  const highPriorityTags = opts.highPriorityTags ?? [];
  const brandName = opts.brandName ?? "your brand";
  const trendWindow = opts.trendWindow ?? 12;
  const snapshots = store.snapshots ?? [];
  const latest = snapshots[snapshots.length - 1] ?? null;
  const previous = snapshots[snapshots.length - 2] ?? null;
  const engineStats = {};
  if (latest) {
    for (const r of latest.results) {
      for (const [name, eng] of Object.entries(r.engines)) {
        engineStats[name] ??= { cited: 0, total: 0, brandMentions: 0, errors: 0, noOpportunity: 0 };
        const s = engineStats[name];
        if (eng.error) {
          s.errors += 1;
        } else if (hasNoAiOverview(eng)) {
          s.noOpportunity += 1;
        } else {
          s.total += 1;
          if (eng.cited) s.cited += 1;
          if (eng.brandMentioned) s.brandMentions += 1;
        }
      }
    }
  }
  const queryRows = latest ? latest.results.map((r) => {
    const q = queries.find((qq) => qq.id === r.queryId);
    const prev = previous?.results.find((pr) => pr.queryId === r.queryId);
    const enginesOut = {};
    for (const [name, e] of Object.entries(r.engines)) {
      const prevE = prev?.engines[name];
      const noOpp = (x) => !!x && (!!x.error || hasNoAiOverview(x));
      let delta = null;
      if (prevE && prevE.cited !== void 0 && e.cited !== void 0 && !noOpp(e) && !noOpp(prevE)) {
        if (e.cited && !prevE.cited) delta = "gained";
        else if (!e.cited && prevE.cited) delta = "lost";
        else delta = "same";
      }
      enginesOut[name] = { ...e, delta };
    }
    return {
      queryId: r.queryId,
      query: q?.query ?? r.queryId,
      tags: q?.tags ?? [],
      engines: enginesOut
    };
  }) : [];
  const wins = [];
  const drops = [];
  for (const row of queryRows) {
    for (const [name, e] of Object.entries(row.engines)) {
      if (e.delta === "gained") wins.push({ queryId: row.queryId, query: row.query, engine: name });
      if (e.delta === "lost") drops.push({ queryId: row.queryId, query: row.query, engine: name });
    }
  }
  const trend = snapshots.slice(-trendWindow).map((s) => {
    const per = {};
    for (const r of s.results) {
      for (const [name, e] of Object.entries(r.engines)) {
        per[name] ??= { cited: 0, total: 0 };
        if (!e.error && !hasNoAiOverview(e)) {
          per[name].total += 1;
          if (e.cited) per[name].cited += 1;
        }
      }
    }
    return { date: s.date, per };
  });
  const actionItems = buildActionItems(queryRows, drops, { highPriorityTags, brandName });
  return {
    lastUpdated: store.lastUpdated,
    hasData: snapshots.length > 0,
    latestDate: latest?.date ?? null,
    engineStats: Object.entries(engineStats).map(([engine, s]) => ({ engine, ...s })),
    queryRows,
    wins: wins.slice(0, 20),
    drops: drops.slice(0, 20),
    trend,
    actionItems
  };
}
function buildActionItems(queryRows, drops, opts) {
  const items = [];
  let mentionOnlyCount = 0;
  for (const row of queryRows) {
    const engs = Object.entries(row.engines);
    const opportunities = engs.filter(([, e]) => !e.error && !hasNoAiOverview(e));
    if (opportunities.length === 0) continue;
    const cited = opportunities.filter(([, e]) => e.cited);
    const mentionedOnly = opportunities.filter(([, e]) => !e.cited && e.brandMentioned);
    if (mentionedOnly.length > 0 && cited.length === 0) mentionOnlyCount += 1;
    const highPriority = row.tags.some((t) => opts.highPriorityTags.includes(t));
    if (cited.length === 0) {
      items.push({
        priority: highPriority ? "high" : "medium",
        action: `Win the query "${row.query}" \u2014 no engine cites you yet.`,
        why: mentionedOnly.length ? `You're mentioned but not linked on ${mentionedOnly.length} engine(s). Publish or strengthen a dedicated page with quotable, citation-backed claims so engines link it.` : `Publish a focused article or strengthen the closest existing page. Lead with a direct, extractable answer + a References section.`
      });
    } else {
      const ranks = cited.map(([, e]) => e.citationRank ?? 99).filter((r) => r > 0);
      const best = ranks.length ? Math.min(...ranks) : 99;
      if (best >= 4) {
        items.push({
          priority: "medium",
          action: `Climb on "${row.query}" \u2014 cited but only at rank #${best}.`,
          why: `Add authoritative citations, tighten the lead answer, and earn internal links to the target page so engines rank it higher among sources.`
        });
      }
    }
  }
  for (const d of drops) {
    items.push({
      priority: "high",
      action: `Investigate lost citation: "${d.query}" on ${d.engine}.`,
      why: `You were cited last snapshot and aren't now. Check for a recent content edit that weakened the answer, a competitor that published something stronger, or a broken/changed URL.`
    });
  }
  if (mentionOnlyCount >= 2) {
    items.push({
      priority: "medium",
      action: `Convert ${mentionOnlyCount} brand-mention-only results into linked citations.`,
      why: `Engines name ${opts.brandName} without linking on several queries. Ensure those topics have a canonical page with a clear URL and self-contained, quotable claims engines can cite.`
    });
  }
  const order = { high: 0, medium: 1, low: 2 };
  items.sort((a, b) => order[a.priority] - order[b.priority]);
  return items.slice(0, 12);
}

// src/engines.ts
var PERPLEXITY_URL = "https://api.perplexity.ai/chat/completions";
var ANTHROPIC_URL = "https://api.anthropic.com/v1/messages";
var SERPAPI_URL = "https://serpapi.com/search.json";
async function queryPerplexity(apiKey, query) {
  const res = await fetch(PERPLEXITY_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
      Accept: "application/json"
    },
    body: JSON.stringify({
      model: "sonar-pro",
      messages: [{ role: "user", content: query }]
    })
  });
  if (!res.ok) {
    return { error: `Perplexity ${res.status}: ${(await res.text()).slice(0, 200)}` };
  }
  const data = await res.json();
  const urls = data.citations ?? [];
  const text = data.choices?.[0]?.message?.content ?? "";
  return { urls, text };
}
async function queryAnthropic(apiKey, query) {
  const reqBody = JSON.stringify({
    model: "claude-sonnet-4-6",
    max_tokens: 2048,
    tools: [{ type: "web_search_20250305", name: "web_search", max_uses: 5 }],
    messages: [{ role: "user", content: query }]
  });
  let res = null;
  for (let attempt = 0; attempt < 3; attempt++) {
    res = await fetch(ANTHROPIC_URL, {
      method: "POST",
      headers: {
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
        "content-type": "application/json"
      },
      body: reqBody
    });
    if (res.ok) break;
    if ((res.status === 529 || res.status === 429 || res.status === 503) && attempt < 2) {
      await new Promise((r) => setTimeout(r, 2e3 * (attempt + 1) * (attempt + 1)));
      continue;
    }
    return { error: `Anthropic ${res.status}: ${(await res.text()).slice(0, 200)}` };
  }
  if (!res || !res.ok) return { error: "Anthropic request failed after retries" };
  const data = await res.json();
  const urls = [];
  let text = "";
  for (const block of data.content ?? []) {
    if (block.type === "text" && block.text) text += block.text + "\n";
    if (block.type === "web_search_tool_result") {
      for (const r of block.content ?? []) {
        if (r.url) urls.push(r.url);
      }
    }
    if (block.type === "server_tool_use" && block.input?.url) {
      urls.push(block.input.url);
    }
    if (Array.isArray(block.citations)) {
      for (const c of block.citations) {
        if (c.url) urls.push(c.url);
      }
    }
  }
  return { urls, text };
}
function extractAioText(blocks) {
  if (!Array.isArray(blocks)) return "";
  const parts = [];
  for (const b of blocks) {
    if (b.snippet) parts.push(b.snippet);
    if (Array.isArray(b.list)) {
      for (const item of b.list) {
        if (item.title) parts.push(item.title);
        if (item.snippet) parts.push(item.snippet);
      }
    }
    if (Array.isArray(b.text_blocks)) parts.push(extractAioText(b.text_blocks));
  }
  return parts.join(" ");
}
async function queryGoogleAio(apiKey, query, location) {
  const url = new URL(SERPAPI_URL);
  url.searchParams.set("engine", "google");
  url.searchParams.set("q", query);
  url.searchParams.set("api_key", apiKey);
  url.searchParams.set("hl", "en");
  url.searchParams.set("gl", "us");
  if (location) url.searchParams.set("location", location);
  const res = await fetch(url);
  if (!res.ok) {
    return { error: `SerpApi ${res.status}: ${(await res.text()).slice(0, 200)}` };
  }
  const data = await res.json();
  let aio = data.ai_overview;
  if (!aio) {
    return { urls: [], text: "", noAiOverview: true };
  }
  if (aio.page_token && !aio.text_blocks) {
    const follow = new URL(SERPAPI_URL);
    follow.searchParams.set("engine", "google_ai_overview");
    follow.searchParams.set("page_token", aio.page_token);
    follow.searchParams.set("api_key", apiKey);
    const r2 = await fetch(follow);
    if (r2.ok) {
      const d2 = await r2.json();
      aio = d2.ai_overview ?? aio;
    }
  }
  const urls = (aio.references ?? []).map((r) => r.link).filter((l) => Boolean(l));
  const text = extractAioText(aio.text_blocks);
  return { urls, text };
}
var ENGINE_BUILDERS = {
  perplexity: (keys) => keys.perplexity ? (q) => queryPerplexity(keys.perplexity, q) : null,
  anthropic: (keys) => keys.anthropic ? (q) => queryAnthropic(keys.anthropic, q) : null,
  "google-aio": (keys, location) => keys.serpapi ? (q) => queryGoogleAio(keys.serpapi, q, location) : null,
  // TODO(port:openai): hit gpt-4o-search-preview, pull citation URLs + text,
  // return EngineRaw. Wire keys.openai here. See scripts/aeo-audit.mjs header.
  openai: () => null
};
function buildEngines(requested, keys, location) {
  const engines = [];
  for (const name of requested) {
    const builder = ENGINE_BUILDERS[name];
    if (!builder) continue;
    const fn = builder(keys, location);
    if (fn) engines.push({ name, fn });
  }
  return engines;
}

// src/store.ts
import { readFile, writeFile } from "fs/promises";
var EMPTY = (maxSnapshots) => ({
  lastUpdated: null,
  maxSnapshots,
  snapshots: []
});
var FsSnapshotStore = class {
  constructor(path, maxSnapshots = 52) {
    this.path = path;
    this.maxSnapshots = maxSnapshots;
  }
  path;
  maxSnapshots;
  async read() {
    try {
      const raw = await readFile(this.path, "utf8");
      const parsed = JSON.parse(raw);
      return {
        lastUpdated: parsed.lastUpdated ?? null,
        maxSnapshots: parsed.maxSnapshots ?? this.maxSnapshots,
        snapshots: parsed.snapshots ?? []
      };
    } catch {
      return EMPTY(this.maxSnapshots);
    }
  }
  async write(data) {
    await writeFile(this.path, JSON.stringify(data, null, 2) + "\n", "utf8");
  }
};
var NullSnapshotStore = class {
  data;
  constructor(maxSnapshots = 52, seed) {
    this.data = seed ?? EMPTY(maxSnapshots);
  }
  async read() {
    return this.data;
  }
  async write(data) {
    this.data = data;
  }
};
function upsertSnapshot(store, snapshot, now = /* @__PURE__ */ new Date()) {
  const snapshots = store.snapshots.filter((s) => s.date !== snapshot.date);
  snapshots.push(snapshot);
  snapshots.sort((a, b) => a.date.localeCompare(b.date));
  const max = store.maxSnapshots || 52;
  const trimmed = snapshots.length > max ? snapshots.slice(-max) : snapshots;
  return {
    lastUpdated: now.toISOString(),
    maxSnapshots: max,
    snapshots: trimmed
  };
}

// src/pack.ts
function brandMatchFromPack(pack) {
  return {
    url: hostOf(pack.brand.siteUrl),
    mentions: pack.aeo.brandMentions
  };
}
function hostOf(siteUrl) {
  try {
    const host = new URL(siteUrl).host.toLowerCase();
    return host.replace(/^www\./, "");
  } catch {
    return siteUrl.toLowerCase().replace(/^https?:\/\//, "").replace(/^www\./, "").split("/")[0] ?? siteUrl;
  }
}
function enginesFromPack(aeo, keys) {
  return buildEngines(aeo.engines, keys, aeo.localSearchLocation);
}
function engineKeysFromEnv(env) {
  return {
    perplexity: env.PERPLEXITY_API_KEY,
    anthropic: env.ANTHROPIC_API_KEY,
    serpapi: env.SERPAPI_KEY,
    openai: env.OPENAI_API_KEY
  };
}
export {
  FsSnapshotStore,
  NullSnapshotStore,
  aggregate,
  brandMatchFromPack,
  buildActionItems,
  buildEngines,
  dateKey,
  engineKeysFromEnv,
  enginesFromPack,
  parseCitations,
  queryAnthropic,
  queryGoogleAio,
  queryPerplexity,
  runAudit,
  upsertSnapshot
};
