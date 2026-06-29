import { AeoQuery, DomainPack, AeoConfig } from '@jeldon/config';
export { AeoQuery } from '@jeldon/config';

/** Engine identifiers the registry knows how to build. OpenAI is structurally
 *  supported (a few lines in `engines.ts`); add its key here when shipped. */
type EngineName = 'perplexity' | 'anthropic' | 'google-aio' | 'openai';
/** What every engine's raw query function returns BEFORE citation parsing.
 *  `error` short-circuits parsing; `noAiOverview` marks "no citation
 *  opportunity surfaced" (Google AIO didn't render) so it's excluded from the
 *  citation-rate denominator rather than counted as a miss. */
interface EngineRaw {
    urls?: string[];
    text?: string;
    noAiOverview?: boolean;
    error?: string;
}
/** A query function for one engine — pure given its closed-over API key. */
type EngineFn = (query: string) => Promise<EngineRaw>;
/** A registered engine: a name + its query function. */
interface Engine {
    name: EngineName | (string & {});
    fn: EngineFn;
}
/** What the brand-match contract feeds `parseCitations`. `url` is matched
 *  (case-insensitively, as a substring) against each citation URL; `mentions`
 *  are prose strings that count as a brand reference even without a link. */
interface BrandMatch {
    url: string;
    mentions: string[];
}
/** Per-engine result for one query after citation parsing. */
interface EngineResult {
    cited?: boolean;
    citationRank?: number | null;
    totalCitations?: number;
    brandMentioned?: boolean;
    responseHash?: string;
    urlsCount?: number;
    noAiOverview?: boolean;
    error?: string;
}
/** Per-query result across all engines run. */
interface QueryResult {
    queryId: string;
    engines: Record<string, EngineResult>;
}
/** One audit run, persisted to the snapshot store. */
interface Snapshot {
    date: string;
    engines: string[];
    queryCount: number;
    results: QueryResult[];
}
/** The persisted store shape — a rolling window of weekly snapshots. */
interface SnapshotStoreData {
    lastUpdated: string | null;
    maxSnapshots: number;
    snapshots: Snapshot[];
}
interface EngineStat {
    engine: string;
    cited: number;
    total: number;
    brandMentions: number;
    errors: number;
    noOpportunity: number;
}
type Delta = 'gained' | 'lost' | 'same' | null;
interface QueryRow {
    queryId: string;
    query: string;
    tags: string[];
    engines: Record<string, EngineResult & {
        delta?: Delta;
    }>;
}
interface WinDrop {
    queryId: string;
    query: string;
    engine: string;
}
interface TrendPoint {
    date: string;
    per: Record<string, {
        cited: number;
        total: number;
    }>;
}
interface ActionItem {
    priority: 'high' | 'medium' | 'low';
    action: string;
    why: string;
}
interface AggregateResult {
    lastUpdated: string | null;
    hasData: boolean;
    latestDate: string | null;
    engineStats: EngineStat[];
    queryRows: QueryRow[];
    wins: WinDrop[];
    drops: WinDrop[];
    trend: TrendPoint[];
    actionItems: ActionItem[];
}

/**
 * Citation parser — ported verbatim from `scripts/aeo-audit.mjs::parseCitations`,
 * with the brand URL + mention list lifted from BoH literals into the injected
 * `BrandMatch` contract (sourced from `pack.brand.siteUrl` + `pack.aeo.brandMentions`).
 *
 * `citationRank` is the 1-indexed position of the first brand URL in the
 * citations list; null if not cited. `brandMentioned` ignores URL matches and
 * looks for prose mentions of the brand/practitioner.
 */
declare function parseCitations(urls: string[], responseText: string, brand: BrandMatch): Pick<EngineResult, 'cited' | 'citationRank' | 'totalCitations' | 'brandMentioned'>;
/** PT (America/Los_Angeles) date key — the snapshot's canonical date. Override
 *  the timezone via `opts.timezone` (e.g. `pack.content.timezone`). */
declare function dateKey(d?: Date, timezone?: string): string;
interface RunAuditOptions {
    brand: BrandMatch;
    timezone?: string;
    /** Hook for progress logging; defaults to a no-op. */
    onProgress?: (queryId: string) => void;
    now?: Date;
}
/**
 * Run the full query set against the active engines and produce one snapshot.
 * Serial across queries (rate limits + politeness), parallel across engines per
 * query — matching `scripts/aeo-audit.mjs::main`. Pure of any persistence; the
 * caller hands the result to `upsertSnapshot` + a `SnapshotStore`.
 */
declare function runAudit(querySet: ReadonlyArray<AeoQuery>, engines: Engine[], opts: RunAuditOptions): Promise<Snapshot>;

/**
 * Read-only aggregator for the "Answer engine presence" panel. Ported from
 * Body of Health `src/pages/api/admin/command/aeo.ts`. Writes are owned by the
 * audit run; this only reads the snapshot window. Two BoH literals are lifted
 * into config: the high-priority tags (was hardcoded `'local'`/`'discovery'`)
 * and the brand name embedded in action-item copy.
 */
interface AggregateOptions {
    /** The query set, for joining query text/tags into the per-query rows. */
    queries: ReadonlyArray<AeoQuery>;
    /** Tags that bump a "win the query" item to high priority. From
     *  `pack.aeo.highPriorityTags` (e.g. `['local','discovery']`). */
    highPriorityTags?: string[];
    /** Brand name woven into the brand-mention action-item copy. From
     *  `pack.brand.name`. Defaults to "your brand". */
    brandName?: string;
    /** How many trailing snapshots feed the trend chart. Default 12. */
    trendWindow?: number;
}
declare function aggregate(store: SnapshotStoreData | {
    lastUpdated: string | null;
    snapshots: Snapshot[];
}, opts: AggregateOptions): AggregateResult;
/**
 * Deterministic AEO improvement advice derived from the latest snapshot. No AI
 * call — grounded, falsifiable, free. Every item points at a specific query or
 * pattern in the data so it's actionable, not generic. Ported from
 * `command/aeo.ts::buildActionItems`; the `local || discovery` tag literal
 * became the injected `highPriorityTags`, and the "Body of Health" brand name
 * became `brandName`.
 */
declare function buildActionItems(queryRows: QueryRow[], drops: Array<{
    query: string;
    engine: string;
}>, opts: {
    highPriorityTags: string[];
    brandName: string;
}): ActionItem[];

declare function queryPerplexity(apiKey: string, query: string): Promise<EngineRaw>;
declare function queryAnthropic(apiKey: string, query: string): Promise<EngineRaw>;
/**
 * Google AI Overviews via SerpApi. `location` is the localized-intent bias
 * (e.g. "Corvallis, Oregon, United States") — pass `pack.aeo.localSearchLocation`.
 * Omit for non-local domains.
 */
declare function queryGoogleAio(apiKey: string, query: string, location?: string): Promise<EngineRaw>;
/** Engine-build options: API keys + the localized search location. */
interface EngineKeys {
    perplexity?: string;
    anthropic?: string;
    serpapi?: string;
    openai?: string;
}
/**
 * Build the active engine registry from the requested engine list + the keys
 * present. An engine whose key is missing is silently dropped (matches the
 * source cron's "whichever keys are present run" behavior).
 */
declare function buildEngines(requested: ReadonlyArray<EngineName | string>, keys: EngineKeys, location?: string): Engine[];

/**
 * I/O boundary for the rolling snapshot window. The audit run reads the
 * current store, upserts today's snapshot (replacing a same-date row), trims
 * to `maxSnapshots`, and writes back. Defaults below: `FsSnapshotStore` for the
 * cron, `NullSnapshotStore` (in-memory, no persistence) for tests/dry-runs.
 * A host backed by GitHub/S3 implements the same two methods.
 */
interface SnapshotStore {
    read(): Promise<SnapshotStoreData>;
    write(data: SnapshotStoreData): Promise<void>;
}
/** JSON-file store (the cron default — `src/data/aeo-audits.json` in BoH). */
declare class FsSnapshotStore implements SnapshotStore {
    private readonly path;
    private readonly maxSnapshots;
    constructor(path: string, maxSnapshots?: number);
    read(): Promise<SnapshotStoreData>;
    write(data: SnapshotStoreData): Promise<void>;
}
/** In-memory store — holds whatever was last written, persists nothing. */
declare class NullSnapshotStore implements SnapshotStore {
    private data;
    constructor(maxSnapshots?: number, seed?: SnapshotStoreData);
    read(): Promise<SnapshotStoreData>;
    write(data: SnapshotStoreData): Promise<void>;
}
/**
 * Upsert a snapshot into the store data (pure). Replaces any same-date row,
 * sorts by date ascending, trims to `maxSnapshots`, stamps `lastUpdated`.
 * Ported from `scripts/aeo-audit.mjs::main`'s store-merge block.
 */
declare function upsertSnapshot(store: SnapshotStoreData, snapshot: Snapshot, now?: Date): SnapshotStoreData;

/**
 * Derive the audit's runtime inputs from a loaded Domain Pack. Keeps every
 * domain literal (brand URL, mentions, query set, engine list, location) read
 * from `pack` rather than hardcoded — the whole point of the port.
 */
/** Brand-match contract from the pack: site host + prose mentions. */
declare function brandMatchFromPack(pack: Pick<DomainPack, 'brand' | 'aeo'>): BrandMatch;
/** Build the active engine registry for a pack + the keys present in env. */
declare function enginesFromPack(aeo: AeoConfig, keys: EngineKeys): Engine[];
/** Read engine API keys from a process-env-like record (no direct process
 *  coupling — pass `process.env` at the host). Mirrors the BoH cron's env names. */
declare function engineKeysFromEnv(env: Record<string, string | undefined>): EngineKeys;

export { type ActionItem, type AggregateOptions, type AggregateResult, type BrandMatch, type Delta, type Engine, type EngineFn, type EngineKeys, type EngineName, type EngineRaw, type EngineResult, type EngineStat, FsSnapshotStore, NullSnapshotStore, type QueryResult, type QueryRow, type RunAuditOptions, type Snapshot, type SnapshotStore, type SnapshotStoreData, type TrendPoint, type WinDrop, aggregate, brandMatchFromPack, buildActionItems, buildEngines, dateKey, engineKeysFromEnv, enginesFromPack, parseCitations, queryAnthropic, queryGoogleAio, queryPerplexity, runAudit, upsertSnapshot };
