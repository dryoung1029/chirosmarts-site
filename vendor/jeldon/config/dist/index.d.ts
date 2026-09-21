import { z } from 'zod';

/**
 * The Domain Pack — the single typed config bundle that specializes the Jeldon
 * engine for one project. The engine packages hardcode NOTHING about any
 * vertical; every value that was a literal in the source system (Body of Health)
 * becomes a key here.
 *
 * A new project edits exactly one file (`jeldon.config.ts`) that default-exports
 * a `DomainPack`. `jeldon validate` checks it against the Zod schema; `jeldon
 * doctor` checks it against the live environment.
 */
interface OrgProfile {
    name: string;
    url: string;
    logoUrl?: string;
    sameAs?: string[];
    /** Free-form extra schema.org fields merged into the Organization node. */
    extra?: Record<string, unknown>;
}
interface PersonProfile {
    name: string;
    jobTitle?: string;
    url?: string;
    image?: string;
    knowsAbout?: string[];
    /** e.g. "BS, DC, MS" or "10y on-call at hyperscale". */
    credential?: string;
    alumniOf?: string[];
    memberOf?: string[];
    awards?: string[];
    sameAs?: string[];
    extra?: Record<string, unknown>;
}
/** A curated llms.txt section: a heading and its bullet links. Consumed by
 *  @jeldon/schema-graph's `emitLlmsTxt`. */
interface LlmsTxtSection {
    heading: string;
    /** Either freeform lines or `[label](url): note` link bullets. */
    items: Array<{
        label: string;
        url?: string;
        note?: string;
    } | string>;
}
/** The curated content that `emitLlmsTxt` renders (llmstxt.org convention).
 *  Everything domain-specific (the most-cited URLs, scope/policy prose) is
 *  data here, not literals in the engine. */
interface LlmsTxtConfig {
    /** One-line summary blockquote under the H1. */
    summary?: string;
    /** Intro paragraph(s) after the summary. */
    intro?: string;
    sections?: LlmsTxtSection[];
}
/** Per-domain knobs for the Article schema graph. Generic by default; the
 *  YMYL/medical-review fields are opt-in. Consumed by @jeldon/schema-graph's
 *  `articleGraph`. */
interface ArticleSchemaPolicy {
    /** Schema @id of the entity that reviewed the article (E-E-A-T). When set,
     *  emits `reviewedBy` + `lastReviewed`. e.g. a credentialed clinician. */
    reviewerSchemaId?: string;
    /** Emit `lastReviewed` (date) alongside `reviewedBy`. Default true when a
     *  reviewer is set. */
    emitLastReviewed?: boolean;
    /** Public URL describing the editorial/review standards (`publishingPrinciples`). */
    publishingPrinciplesUrl?: string;
    /** Hero image intrinsic dimensions for the ImageObject node. */
    heroImageDimensions?: {
        width: number;
        height: number;
    };
    /** Name of the podcast series for `isBasedOn` when an article has a source episode. */
    sourceEpisodeSeriesName?: string;
}
/** One GEO check. Detection is data, not code — this is what makes the scorer
 *  domain-agnostic. `thresholds` is `[good, meh]`. */
interface GeoCheckDef {
    id: string;
    label: string;
    weight: number;
    kind: 'regexCount' | 'regexPer1k' | 'questionH2';
    /** Regex sources (compiled at runtime). For `questionH2`, these are the
     *  question-starter words (e.g. ["what","why","how"]). */
    patterns?: string[];
    flags?: string;
    /** Which text the patterns run against. Default 'cleaned'. */
    target?: 'cleaned' | 'body';
    thresholds: [number, number];
}
interface GeoConfig {
    /** CI gate threshold. Must be <= min(content.categoryTargets). */
    floor: number;
    checks: GeoCheckDef[];
}
interface SeoConfig {
    title: {
        good: [number, number];
        mehMax: number;
    };
    excerpt: {
        good: [number, number];
        meh: [number, number];
    };
    slugMaxLen: number;
    wordCount: {
        good: [number, number];
        mehMin: number;
    };
    /** Body char ceilings (the TTS/length check). */
    bodyChars: {
        good: number;
        meh: number;
    };
    h2: {
        good: [number, number];
        meh: [number, number];
    };
    internalLinks: {
        good: number;
        meh: number;
    };
    tags: {
        good: [number, number];
        mehMin: number;
    };
    heroAltWords: {
        good: [number, number];
    };
    /** Acceptable Flesch-Kincaid grade band; `mehMax` is the upper meh bound. */
    reading: {
        good: [number, number];
        mehMax: number;
    };
    /** URL path prefixes that count as internal links, e.g. ["articles","care"]. */
    internalLinkPrefixes: string[];
    /** Section H2 names that satisfy the references requirement. */
    referenceSectionNames: string[];
    /** Words that, when present, require a linked references section. */
    evidenceTriggers: string[];
    /** Regex source flagging camera-dump style image filenames. */
    badFilenameRe: string;
}
interface ScoringConfig {
    geo: GeoConfig;
    seo: SeoConfig;
}
interface CitationConfig {
    /** Explicit per-domain choice — resolves the BoH lint-vs-cite8 contradiction. */
    policy: 'direct-source-urls' | 'search-urls-only' | 'verifier-required';
    /** Lint regexes — e.g. a fabricated-PMID guard. */
    forbiddenPatterns: string[];
    referenceFormat: string;
    verifier: {
        kind: 'none' | 'cite8' | 'primary-source';
        baseUrl?: string;
    };
}
interface AeoQuery {
    id: string;
    query: string;
    tags: string[];
}
interface AeoConfig {
    /** Prose mentions that count as a brand reference even without a link. */
    brandMentions: string[];
    /** Localized search location for engines that support it; omit for non-local. */
    localSearchLocation?: string;
    querySet: AeoQuery[];
    engines: Array<'perplexity' | 'anthropic' | 'google-aio' | 'openai'>;
    /** Tags that bump an action item's priority. */
    highPriorityTags: string[];
    maxSnapshots?: number;
}
/**
 * One class of third-party surface where a brand can be mentioned off-site
 * (Reddit, Wikipedia, an industry forum, a comparison/"best-of" listicle, a
 * Q&A site). The audit (AEO-PLAYBOOK §"biggest lever") flags off-site mentions
 * as correlating ~3× stronger with AI visibility than backlinks — and the
 * effect differs per engine (Reddit → Perplexity, Wikipedia/consensus →
 * ChatGPT, structured depth → Claude). Everything here is data so a non-clinic
 * domain re-points its source set without touching engine code.
 */
interface EntityPresenceSource {
    /** Stable key, e.g. "reddit", "wikipedia", "industry-forum". */
    id: string;
    /** Human label surfaced in the report. */
    label: string;
    /** Host substrings that identify a citation/mention as living on this source
     *  (lowercased, matched as substrings against a URL host). e.g. ["reddit.com"]. */
    hostNeedles: string[];
    /** Relative importance of presence on this source (0-1). Tunable per domain. */
    weight: number;
    /** When true, NAP / name-string consistency is expected to be verifiable on
     *  this source (a listing-style surface) — a mismatch is flagged. Discussion
     *  surfaces (Reddit threads) set this false. Default false. */
    napConsistencyChecked?: boolean;
}
/** Per-answer-engine off-site source affinity. Encodes the playbook finding
 *  that each engine weights different third-party surfaces. `affinity` maps an
 *  `EntityPresenceSource.id` → relative pull (0-1) for THIS engine. */
interface EnginePresenceAffinity {
    /** Engine id, e.g. "perplexity", "anthropic", "openai". */
    engine: string;
    /** sourceId → how strongly this engine leans on that source (0-1). */
    affinity: Record<string, number>;
    /** One-line note on the engine's documented retrieval behavior. */
    note?: string;
}
/** Which brand identity strings must read identically across listing-style
 *  off-site surfaces. A drift (e.g. an old phone number on a directory) is the
 *  consistency signal AI engines penalize. */
interface MentionConsistencyTargets {
    /** The canonical brand name string. From `pack.brand.name` when omitted. */
    name?: string;
    /** Canonical NAP fields whose values must match across sources. Keys are
     *  free-form (address/phone/url/…); values are the canonical string. */
    nap: Record<string, string>;
}
interface EntityPresenceConfig {
    /** The third-party surface set to audit. */
    sources: EntityPresenceSource[];
    /** Per-engine source affinities (the Reddit→Perplexity / Wikipedia→ChatGPT
     *  finding, expressed as data). */
    engineAffinities: EnginePresenceAffinity[];
    /** Identity strings checked for cross-source consistency. */
    consistencyTargets?: MentionConsistencyTargets;
    /** A mention-count at/above which a source counts as "established presence"
     *  (vs a single stray mention). Default 3. */
    establishedThreshold?: number;
}
/** Numeric knobs for the deterministic recommendations engine. Every magic
 *  number that was inline in the BoH `strategy.ts` lives here. */
interface StrategyThresholds {
    /** Min requests for a 404 on a real site-route to be worth flagging. */
    real404MinRequests: number;
    /** Request count at/above which a 404 rec escalates to high priority. */
    real404HighRequests: number;
    /** Min 5xx count over the window before the server-error rec fires. */
    serverError5xxMin: number;
    /** 5xx count at/above which the server-error rec escalates to high. */
    serverError5xxHigh: number;
    /** How many top content paths to inspect for GEO/audio recs. */
    topContentPaths: number;
    /** A top-N content path (1-based) at/above this rank is "high" for GEO. */
    geoHighTopRank: number;
    /** Margin below the category target before a GEO rec fires (target - margin). */
    geoTargetMargin: number;
    /** Only top-N pages by traffic get an audio-coverage rec. */
    audioTopRank: number;
    /** Min total referrers before the social-gap rec is meaningful. */
    socialMinReferrers: number;
    /** Social share of referrers (0-1) at/below which the gap rec fires. */
    socialGapFraction: number;
    /** Absolute floor for the social gap test (max(this, total*fraction)). */
    socialGapFloor: number;
    /** Keyword rank range that counts as a page-2→1 climb opportunity. */
    climbRankRange: [number, number];
    /** How many climb opportunities to surface. */
    climbMax: number;
    /** Final cap on the number of recommendations returned. */
    maxRecommendations: number;
}
/** Referer-source needle groups, lowercased substring matches. Domain-agnostic
 *  — a non-social-media business overrides these. */
interface StrategyRefererGroups {
    social: string[];
    search: string[];
}
/** The crawler "purpose" label that means a live answer-engine retrieval (vs
 *  indexing/training). BoH's classifier emits 'live'. */
interface StrategyConfig {
    thresholds: StrategyThresholds;
    /** Regex sources (anchored, compiled at runtime) for paths that count as
     *  OUR content — a 404 on one of these is actionable; everything else is
     *  bot/scanner noise. e.g. `^/articles/[a-z0-9-]+/?$`. */
    siteRoute404Patterns: string[];
    /** Regex source matching an article-detail path, with the slug as group 1.
     *  e.g. `^/articles/([^/]+)$`. Used to join top-paths to article health. */
    articlePathPattern: string;
    refererGroups: StrategyRefererGroups;
    /** Crawler purpose label denoting live retrieval (vs index/train). */
    liveCrawlPurpose: string;
    /** Deep-links the rendered recs point at (host admin routes). Each is a
     *  `{ link, linkLabel }` pair keyed by a stable slot name. */
    deepLinks: Record<string, {
        link: string;
        linkLabel?: string;
    }>;
    /** Copy templates per built-in rule. `{token}` placeholders are filled from
     *  the rule's computed facts. Lets a domain re-voice every line without code. */
    copy: Record<string, {
        title: string;
        evidence: string;
    }>;
}
/** One distribution channel the amplify kit produces copy for. Everything that
 *  was a hardcoded channel literal in the BoH `amplify/[slug].ts` (the label,
 *  the per-channel rules paragraph, the tool-field description, the UTM string)
 *  is data here so a non-clinic domain re-channels without touching engine code. */
interface AmplifyChannel {
    /** Stable key, e.g. "gbp", "facebook", "linkedin", "newsletterBody". */
    id: string;
    /** Human label, e.g. "Google Business Profile post". */
    label: string;
    /** The channel-specific guidance paragraph injected into the system prompt. */
    guidance: string;
    /** The tool input_schema field description for this channel's output. */
    fieldDescription: string;
    /** UTM query string (without leading `?`) appended to the article URL for
     *  this channel, e.g. "utm_source=gbp&utm_medium=organic". Omit for channels
     *  that carry no link (e.g. an Instagram "link in bio" caption). */
    utm?: string;
    /** When true this channel is excluded from the full-kit tool's required list
     *  and never URL-tagged (e.g. a subject line). Default false. */
    noUrl?: boolean;
}
/** One high-contrast carousel color scheme (BoH `COLOR_SCHEMES`). */
interface CarouselScheme {
    id: string;
    label: string;
    bg: string;
    fg: string;
    accent: string;
}
/** Config for the amplification kit + IG carousel + newsletter content gen.
 *  Optional on the pack — `@jeldon/amplify` falls back to `defaultAmplifyConfig`. */
interface AmplifyConfig {
    /** Distribution channels the full kit produces. */
    channels: AmplifyChannel[];
    /** Extra preamble lines about the brand/role for the kit system prompt.
     *  The voice block itself comes from `pack.voice` — this is just the
     *  "you are a content distribution editor for X" framing. */
    systemPreamble: string;
    /** IG carousel color schemes (the model picks one, the host renders it). */
    carouselSchemes: CarouselScheme[];
    /** The carousel design system prompt (hook/reveal/payoff playbook). Domain
     *  voice still injected from `pack.voice`; this is the structural craft. */
    carouselGuidance: string;
    /** Newsletter content spec: the subject/body shape paragraph. */
    newsletterGuidance: string;
    /** Repo-relative dir holding `<slug>.json` carousel sidecars. Default
     *  `src/data/carousel-state`. */
    carouselStateDir?: string;
}
interface CompetitorEntry {
    id: string;
    name: string;
    url: string;
    placeId?: string;
    targetKeywords?: string[];
}
interface CompetitorsConfig {
    ourPlaceId?: string;
    ourName?: string;
    localPackLocation?: string;
    roster: CompetitorEntry[];
    targetKeywords: string[];
    highValuePatterns?: string[];
    skipPatterns?: string[];
    templateVendors?: Array<{
        name: string;
        fingerprints: string[];
    }>;
}
/**
 * Knobs for the drafting/editor-chat orchestration. Optional — the engine
 * falls back to `defaultDraftingConfig`. Everything domain-specific that was a
 * literal in BoH `author.ts` / `chat.ts` (the model alias map, the draft-time
 * floor, the author word-count targets) lives here; the prompt STRINGS are
 * built from `pack.voice` by @jeldon/drafting's PromptPack and can be overridden
 * field-by-field via `promptOverrides`.
 */
interface DraftingConfig {
    /** Alias → provider model id. BoH: sonnet/opus/haiku. The default-draft model
     *  alias is `defaultModel`; the cheap claim-extraction model is `utilityModel`. */
    models: Record<string, string>;
    defaultModel: string;
    /** Cheap model for research-claim extraction (BoH used Haiku). */
    utilityModel: string;
    /** SEO/GEO floor at draft time before a fix-pass fires. BoH: 70/70. */
    draftFloor: {
        seo: number;
        geo: number;
    };
    /** Author word-count target range surfaced in the draft prompts. BoH: 800–1500. */
    wordCountTarget: [number, number];
    /** Body char ceiling surfaced in the draft prompts (TTS chunk threshold). BoH: 10000. */
    bodyCharCeiling: number;
    /** Per-mode max output tokens. Keyed by drafting mode. */
    maxTokens: {
        brainstorm: number;
        draft: number;
        outline: number;
        'draft-series': number;
        'draft-series-article': number;
        fixPass: number;
        extractClaims: number;
        chat: number;
    };
    /** Optional full-string overrides for any prompt block, by slot name (e.g.
     *  'voice', 'geoPlaybook', 'chatSystem'). When set, replaces the built-from-
     *  voice default verbatim. Lets a domain hand-author a prompt if the
     *  voice-derived default isn't enough. */
    promptOverrides?: Record<string, string>;
}
/** A single IPA pronunciation override the TTS engine wraps in a `<phoneme>`
 *  SSML tag. BoH used these to force American stress on "skeletal" and the
 *  local readings of Corvallis / Willamette. Pure data — a non-clinic domain
 *  ships its own list (or none). */
interface PronunciationOverride {
    word: string;
    ipa: string;
}
/** An abbreviation the clone otherwise reads letter-by-letter or mispronounces.
 *  Match is case-sensitive + word-bounded. e.g. `{ abbr: "MRI", full: "M R I" }`. */
interface AbbreviationExpansion {
    abbr: string;
    full: string;
}
/** ElevenLabs voice settings. The numeric trade-offs (stability / style /
 *  similarity) are tuning, not constants — every value is a knob. */
interface VoiceSettings {
    stability: number;
    similarity_boost: number;
    style: number;
    use_speaker_boost: boolean;
}
/** TTS / narration config. Everything BoH hardcoded in `narration.ts` +
 *  `audio/[slug].ts` (voice id, model, settings, pronunciation tables, the
 *  spoken outro, the chunk + safety thresholds) is data here. */
interface NarrationConfig {
    /** Provider voice id (BoH: the Dr. Young clone). */
    voiceId: string;
    /** Provider model id (BoH: `eleven_multilingual_v2`). */
    model: string;
    voiceSettings: VoiceSettings;
    /** Spoken sign-off appended (cached) to every article. */
    outroText: string;
    /** IPA `<phoneme>` overrides applied before synthesis. */
    pronunciationOverrides: PronunciationOverride[];
    /** Abbreviation → spoken-form expansions. */
    abbreviationExpansions: AbbreviationExpansion[];
    /** Max chars per single TTS request (provider cap; BoH chunks at 9000). */
    chunkChars: number;
    /** Hard char ceiling per generation so a runaway article can't burn budget. */
    maxChars: number;
    /** H2 section names whose content (to end-of-doc) is dropped from narration. */
    referenceSectionNames: string[];
}
/** Hero-image generation config. The locked sketchbook style pack + the
 *  art-director system prompt + the gpt-image size/quality knobs. The
 *  `{TOPIC}` / `{CONCEPT}` placeholders in `promptTemplate` are filled by the
 *  proposal tool. */
interface HeroImageConfig {
    /** Provider model id (BoH: `gpt-image-2`). */
    model: string;
    /** Output size, e.g. `1024x1536` (portrait 2:3). */
    size: string;
    /** Quality tier: `low | medium | high`. */
    quality: string;
    /** The locked style template with `{TOPIC}` + `{CONCEPT}` slots. */
    promptTemplate: string;
    /** The art-director system prompt for the concept-proposal call. */
    proposalSystem: string;
}
/** Podcast trailer episode (a one-time intro). Optional. */
interface PodcastTrailer {
    title: string;
    /** Site-relative path to the trailer MP3. */
    audioPath: string;
    audioSize: number;
    duration: string;
    /** RFC-822 / UTC date string. */
    pubDate: string;
    summary: string;
}
/** Podcast RSS channel config. Everything BoH hardcoded in `podcast.xml.ts`
 *  (show title, description, author, owner email, category, cover, trailer). */
interface PodcastConfig {
    title: string;
    subtitle: string;
    description: string;
    author: string;
    ownerEmail: string;
    /** Apple top-level category, e.g. "Health & Fitness". */
    category: string;
    /** Apple sub-category, e.g. "Alternative Health". */
    subcategory?: string;
    copyright?: string;
    language?: string;
    /** Absolute or site-relative cover image URL (Apple wants 1400–3000px square). */
    coverImage: string;
    /** Chars-per-minute estimate for the duration heuristic (BoH: 950). */
    charsPerMinute?: number;
    trailer?: PodcastTrailer;
}
/** The media surface config (@jeldon/media). Optional on the pack — the engine
 *  falls back to `defaultMediaConfig`. Gated by `capabilities.audio` /
 *  `capabilities.heroImages`. */
interface MediaConfig {
    narration: NarrationConfig;
    heroImage: HeroImageConfig;
    podcast: PodcastConfig;
}
/** One AI-crawler fingerprint. A single injected list kills the 2-file
 *  duplication between BoH `ai-crawlers.ts` (regex) and `fetch-cf-analytics.mjs`
 *  (substring). `match` is a case-insensitive substring of the User-Agent.
 *  More-specific tokens must precede their prefixes (e.g. "Claude-SearchBot"
 *  before "ClaudeBot") so the broad rule doesn't shadow the narrow one. */
interface AiBot {
    /** Case-insensitive UA substring that identifies the bot. */
    match: string;
    /** Canonical bot name surfaced in analytics. */
    bot: string;
    /** Answer-engine vendor, e.g. "openai", "anthropic". */
    engine: string;
    /** What the crawl is for: model training, search indexing, or a live
     *  answer-engine retrieval on behalf of a user. */
    purpose: 'train' | 'index' | 'live';
}
/** One referer-channel rule. A single injected map kills the 3-file
 *  triplication (`classifyReferer`, `classifySource`, the editor CTA logic).
 *  `needles` are lowercased substrings; the first rule whose any-needle matches
 *  the (lowercased) host/source wins. `drop:true` suppresses the source
 *  entirely (e.g. internal nav, an auth redirect). */
interface RefererChannelRule {
    /** Friendly channel label, e.g. "Google Search". Ignored when `drop` is set. */
    label?: string;
    /** Lowercased substrings; any match selects this rule. */
    needles: string[];
    /** When true, a matching host is excluded from the source breakdown. */
    drop?: boolean;
}
/** Config for the crawler + edge-analytics surface (@jeldon/crawler-analytics).
 *  Optional on the pack — the engine falls back to `defaultAnalyticsConfig`.
 *  Everything BoH hardcoded (the AI bot list ×2, the referer map ×3, the CF
 *  zone/account ids, the human/bot UA heuristic, the article-path regex) is
 *  data here so a non-clinic domain re-points it without touching engine code. */
interface AnalyticsConfig {
    /** AI-crawler fingerprints, longest/most-specific token first. */
    aiBotList: AiBot[];
    /** Referer/source → channel rules, evaluated in order. The label for a host
     *  matching no rule is the bare host. */
    refererChannelMap: RefererChannelRule[];
    /** Label returned for an empty/absent referer. BoH: "Direct / none". */
    directLabel: string;
    /** Regex source matching an article-detail path with the slug as group 1.
     *  e.g. `^/articles/([a-z0-9-]+)/?$`. Joins edge hits to per-article traffic. */
    articlePathPattern: string;
    /** Regex source for asset/noise paths excluded from "top pages" + per-bot
     *  path lists (anchored at the path start). */
    assetPathPattern: string;
    /** Regex source for UA tokens that mark a request as a bot in the coarse
     *  human/bot split (no paid bot-management on the free plan — directional). */
    botUaPattern: string;
    /** Anchored regex sources for paths that are OUR content (e.g.
     *  `^/articles/[a-z0-9-]+/?$`). A 404 on one of these survives the top-25
     *  truncation so a real broken link is never buried under bot-scanner noise.
     *  LOCKSTEP with `strategy.siteRoute404Patterns` in BoH. */
    siteRoute404Patterns: string[];
    /** Cloudflare GraphQL Analytics ids. Secret token is read from env, not here. */
    cloudflare?: {
        zoneId?: string;
        accountId?: string;
        /** GraphQL endpoint; defaults to the public CF Analytics API. */
        endpoint?: string;
    };
    /** Rolling traffic window (days) the readers sum over. BoH: 30. */
    windowDays: number;
    /** Max daily snapshots retained in the rolling stores. BoH: 365. */
    maxDailySnapshots: number;
}
interface DomainPack {
    brand: {
        name: string;
        siteUrl: string;
        tagline?: string;
        /** Arbitrary geographic framing, e.g. "Corvallis and Albany". */
        geoFraming?: string;
        nap?: {
            address?: string;
            city?: string;
            region?: string;
            postalCode?: string;
            phone?: string;
            placeId?: string;
        };
        logoUrl?: string;
        brandColors?: Record<string, string>;
    };
    authors: Array<{
        slug: string;
        name: string;
        title?: string;
        /** @id linked by every Article graph for E-E-A-T consolidation. */
        schemaId: string;
        profile: PersonProfile;
        isPrimary?: boolean;
    }>;
    /** The SINGLE source for all prompt injection. Consumed by @jeldon/drafting,
     *  @jeldon/amplify, @jeldon/competitive-intel. */
    voice: {
        persona: string;
        bannedTopics: string[];
        bannedPhrasings: string[];
        rules: string[];
        voiceAnchorUrls: string[];
        readingGradeBand: [number, number];
    };
    content: {
        categories: string[];
        /** GEO target per category (>= scoring.geo.floor). */
        categoryTargets: Record<string, number>;
        defaultAuthorSlug: string;
        timezone: string;
        lifecycle?: {
            docReviewed?: boolean;
        };
    };
    scoring: ScoringConfig;
    citation: CitationConfig;
    aeo: AeoConfig;
    competitors?: CompetitorsConfig;
    /** Tuning for the deterministic recommendations engine (@jeldon/strategy).
     *  Optional — engine falls back to `defaultStrategyConfig`. */
    strategy?: StrategyConfig;
    /** Channels/schemes/prompts for the amplification kit (@jeldon/amplify).
     *  Optional — engine falls back to `defaultAmplifyConfig`. */
    amplify?: AmplifyConfig;
    /** Tuning for the drafting + editor-chat orchestration (@jeldon/drafting).
     *  Optional — engine falls back to `defaultDraftingConfig`. */
    drafting?: DraftingConfig;
    /** Narration (TTS) + hero-image + podcast config (@jeldon/media). Optional —
     *  engine falls back to `defaultMediaConfig`. Gated by `capabilities.audio` /
     *  `capabilities.heroImages`. */
    media?: MediaConfig;
    /** AI-crawler + edge-analytics config (@jeldon/crawler-analytics). Optional —
     *  engine falls back to `defaultAnalyticsConfig`. Gated by
     *  `capabilities.engagementAnalytics`. */
    analytics?: AnalyticsConfig;
    /** Off-site brand-mention + per-engine citation-pattern config
     *  (@jeldon/entity-presence). Optional — engine falls back to
     *  `defaultEntityPresenceConfig`. Gated by `capabilities.entityPresence`. */
    entityPresence?: EntityPresenceConfig;
    schema: {
        orgType: string[];
        org: OrgProfile;
        /** e.g. ["Article"] generic, or ["Article","MedicalWebPage"] for YMYL. */
        articleTypes: string[];
        publishingPrinciplesUrl?: string;
        /** Per-domain Article-graph policy (reviewer @id, review dates, etc.). */
        articleGraph?: ArticleSchemaPolicy;
        /** Cheap-to-emit, never a ranking pillar. Default false. */
        emitLlmsTxt?: boolean;
        /** Curated content `emitLlmsTxt` renders. Required when emitLlmsTxt is true. */
        llmsTxt?: LlmsTxtConfig;
    };
    /** Pluggable compliance policy. HIPAA et al are OPT-IN here, never in the
     *  engine. Default `none`. */
    compliance?: {
        pack: 'none' | 'hipaa' | 'legal' | 'finance' | (string & {});
        reviewResponseRules?: string[];
        requireHumanReviewTags?: string[];
    };
    /** Which growth surfaces exist for this project. */
    capabilities: {
        drafting?: boolean;
        amplify?: boolean;
        audio?: boolean;
        heroImages?: boolean;
        competitiveIntel?: boolean;
        engagementAnalytics?: boolean;
        entityPresence?: boolean;
    };
    /** Required services + env. `jeldon doctor` verifies these. */
    services: {
        store: 'github' | 'fs';
        /** Repo-relative directory holding `<slug>.md` articles. Consumed by
         *  @jeldon/store (was the hardcoded `src/content/articles` literal in BoH).
         *  Defaults to `src/content/articles` when omitted. */
        contentDir?: string;
        analytics?: 'cloudflare' | 'none';
        requiredEnv: string[];
    };
}

declare const domainPackSchema: z.ZodEffects<z.ZodObject<{
    brand: z.ZodObject<{
        name: z.ZodString;
        siteUrl: z.ZodString;
        tagline: z.ZodOptional<z.ZodString>;
        geoFraming: z.ZodOptional<z.ZodString>;
        nap: z.ZodOptional<z.ZodObject<{
            address: z.ZodOptional<z.ZodString>;
            city: z.ZodOptional<z.ZodString>;
            region: z.ZodOptional<z.ZodString>;
            postalCode: z.ZodOptional<z.ZodString>;
            phone: z.ZodOptional<z.ZodString>;
            placeId: z.ZodOptional<z.ZodString>;
        }, "strip", z.ZodTypeAny, {
            placeId?: string | undefined;
            address?: string | undefined;
            city?: string | undefined;
            region?: string | undefined;
            postalCode?: string | undefined;
            phone?: string | undefined;
        }, {
            placeId?: string | undefined;
            address?: string | undefined;
            city?: string | undefined;
            region?: string | undefined;
            postalCode?: string | undefined;
            phone?: string | undefined;
        }>>;
        logoUrl: z.ZodOptional<z.ZodString>;
        brandColors: z.ZodOptional<z.ZodRecord<z.ZodString, z.ZodString>>;
    }, "strip", z.ZodTypeAny, {
        name: string;
        siteUrl: string;
        logoUrl?: string | undefined;
        nap?: {
            placeId?: string | undefined;
            address?: string | undefined;
            city?: string | undefined;
            region?: string | undefined;
            postalCode?: string | undefined;
            phone?: string | undefined;
        } | undefined;
        tagline?: string | undefined;
        geoFraming?: string | undefined;
        brandColors?: Record<string, string> | undefined;
    }, {
        name: string;
        siteUrl: string;
        logoUrl?: string | undefined;
        nap?: {
            placeId?: string | undefined;
            address?: string | undefined;
            city?: string | undefined;
            region?: string | undefined;
            postalCode?: string | undefined;
            phone?: string | undefined;
        } | undefined;
        tagline?: string | undefined;
        geoFraming?: string | undefined;
        brandColors?: Record<string, string> | undefined;
    }>;
    authors: z.ZodArray<z.ZodObject<{
        slug: z.ZodString;
        name: z.ZodString;
        title: z.ZodOptional<z.ZodString>;
        schemaId: z.ZodString;
        profile: z.ZodObject<{
            name: z.ZodString;
            jobTitle: z.ZodOptional<z.ZodString>;
            url: z.ZodOptional<z.ZodString>;
            image: z.ZodOptional<z.ZodString>;
            knowsAbout: z.ZodOptional<z.ZodArray<z.ZodString, "many">>;
            credential: z.ZodOptional<z.ZodString>;
            alumniOf: z.ZodOptional<z.ZodArray<z.ZodString, "many">>;
            memberOf: z.ZodOptional<z.ZodArray<z.ZodString, "many">>;
            awards: z.ZodOptional<z.ZodArray<z.ZodString, "many">>;
            sameAs: z.ZodOptional<z.ZodArray<z.ZodString, "many">>;
            extra: z.ZodOptional<z.ZodRecord<z.ZodString, z.ZodUnknown>>;
        }, "strip", z.ZodTypeAny, {
            name: string;
            url?: string | undefined;
            sameAs?: string[] | undefined;
            extra?: Record<string, unknown> | undefined;
            jobTitle?: string | undefined;
            image?: string | undefined;
            knowsAbout?: string[] | undefined;
            credential?: string | undefined;
            alumniOf?: string[] | undefined;
            memberOf?: string[] | undefined;
            awards?: string[] | undefined;
        }, {
            name: string;
            url?: string | undefined;
            sameAs?: string[] | undefined;
            extra?: Record<string, unknown> | undefined;
            jobTitle?: string | undefined;
            image?: string | undefined;
            knowsAbout?: string[] | undefined;
            credential?: string | undefined;
            alumniOf?: string[] | undefined;
            memberOf?: string[] | undefined;
            awards?: string[] | undefined;
        }>;
        isPrimary: z.ZodOptional<z.ZodBoolean>;
    }, "strip", z.ZodTypeAny, {
        name: string;
        slug: string;
        schemaId: string;
        profile: {
            name: string;
            url?: string | undefined;
            sameAs?: string[] | undefined;
            extra?: Record<string, unknown> | undefined;
            jobTitle?: string | undefined;
            image?: string | undefined;
            knowsAbout?: string[] | undefined;
            credential?: string | undefined;
            alumniOf?: string[] | undefined;
            memberOf?: string[] | undefined;
            awards?: string[] | undefined;
        };
        title?: string | undefined;
        isPrimary?: boolean | undefined;
    }, {
        name: string;
        slug: string;
        schemaId: string;
        profile: {
            name: string;
            url?: string | undefined;
            sameAs?: string[] | undefined;
            extra?: Record<string, unknown> | undefined;
            jobTitle?: string | undefined;
            image?: string | undefined;
            knowsAbout?: string[] | undefined;
            credential?: string | undefined;
            alumniOf?: string[] | undefined;
            memberOf?: string[] | undefined;
            awards?: string[] | undefined;
        };
        title?: string | undefined;
        isPrimary?: boolean | undefined;
    }>, "many">;
    voice: z.ZodObject<{
        persona: z.ZodString;
        bannedTopics: z.ZodArray<z.ZodString, "many">;
        bannedPhrasings: z.ZodArray<z.ZodString, "many">;
        rules: z.ZodArray<z.ZodString, "many">;
        voiceAnchorUrls: z.ZodArray<z.ZodString, "many">;
        readingGradeBand: z.ZodTuple<[z.ZodNumber, z.ZodNumber], null>;
    }, "strip", z.ZodTypeAny, {
        persona: string;
        bannedTopics: string[];
        bannedPhrasings: string[];
        rules: string[];
        voiceAnchorUrls: string[];
        readingGradeBand: [number, number];
    }, {
        persona: string;
        bannedTopics: string[];
        bannedPhrasings: string[];
        rules: string[];
        voiceAnchorUrls: string[];
        readingGradeBand: [number, number];
    }>;
    content: z.ZodObject<{
        categories: z.ZodArray<z.ZodString, "many">;
        categoryTargets: z.ZodRecord<z.ZodString, z.ZodNumber>;
        defaultAuthorSlug: z.ZodString;
        timezone: z.ZodString;
        lifecycle: z.ZodOptional<z.ZodObject<{
            docReviewed: z.ZodOptional<z.ZodBoolean>;
        }, "strip", z.ZodTypeAny, {
            docReviewed?: boolean | undefined;
        }, {
            docReviewed?: boolean | undefined;
        }>>;
    }, "strip", z.ZodTypeAny, {
        categories: string[];
        categoryTargets: Record<string, number>;
        defaultAuthorSlug: string;
        timezone: string;
        lifecycle?: {
            docReviewed?: boolean | undefined;
        } | undefined;
    }, {
        categories: string[];
        categoryTargets: Record<string, number>;
        defaultAuthorSlug: string;
        timezone: string;
        lifecycle?: {
            docReviewed?: boolean | undefined;
        } | undefined;
    }>;
    scoring: z.ZodObject<{
        geo: z.ZodObject<{
            floor: z.ZodNumber;
            checks: z.ZodArray<z.ZodObject<{
                id: z.ZodString;
                label: z.ZodString;
                weight: z.ZodNumber;
                kind: z.ZodEnum<["regexCount", "regexPer1k", "questionH2"]>;
                patterns: z.ZodOptional<z.ZodArray<z.ZodString, "many">>;
                flags: z.ZodOptional<z.ZodString>;
                target: z.ZodOptional<z.ZodEnum<["cleaned", "body"]>>;
                thresholds: z.ZodTuple<[z.ZodNumber, z.ZodNumber], null>;
            }, "strip", z.ZodTypeAny, {
                id: string;
                label: string;
                weight: number;
                kind: "regexCount" | "regexPer1k" | "questionH2";
                thresholds: [number, number];
                patterns?: string[] | undefined;
                flags?: string | undefined;
                target?: "cleaned" | "body" | undefined;
            }, {
                id: string;
                label: string;
                weight: number;
                kind: "regexCount" | "regexPer1k" | "questionH2";
                thresholds: [number, number];
                patterns?: string[] | undefined;
                flags?: string | undefined;
                target?: "cleaned" | "body" | undefined;
            }>, "many">;
        }, "strip", z.ZodTypeAny, {
            floor: number;
            checks: {
                id: string;
                label: string;
                weight: number;
                kind: "regexCount" | "regexPer1k" | "questionH2";
                thresholds: [number, number];
                patterns?: string[] | undefined;
                flags?: string | undefined;
                target?: "cleaned" | "body" | undefined;
            }[];
        }, {
            floor: number;
            checks: {
                id: string;
                label: string;
                weight: number;
                kind: "regexCount" | "regexPer1k" | "questionH2";
                thresholds: [number, number];
                patterns?: string[] | undefined;
                flags?: string | undefined;
                target?: "cleaned" | "body" | undefined;
            }[];
        }>;
        seo: z.ZodObject<{
            title: z.ZodObject<{
                good: z.ZodTuple<[z.ZodNumber, z.ZodNumber], null>;
                mehMax: z.ZodNumber;
            }, "strip", z.ZodTypeAny, {
                good: [number, number];
                mehMax: number;
            }, {
                good: [number, number];
                mehMax: number;
            }>;
            excerpt: z.ZodObject<{
                good: z.ZodTuple<[z.ZodNumber, z.ZodNumber], null>;
                meh: z.ZodTuple<[z.ZodNumber, z.ZodNumber], null>;
            }, "strip", z.ZodTypeAny, {
                good: [number, number];
                meh: [number, number];
            }, {
                good: [number, number];
                meh: [number, number];
            }>;
            slugMaxLen: z.ZodNumber;
            wordCount: z.ZodObject<{
                good: z.ZodTuple<[z.ZodNumber, z.ZodNumber], null>;
                mehMin: z.ZodNumber;
            }, "strip", z.ZodTypeAny, {
                good: [number, number];
                mehMin: number;
            }, {
                good: [number, number];
                mehMin: number;
            }>;
            bodyChars: z.ZodObject<{
                good: z.ZodNumber;
                meh: z.ZodNumber;
            }, "strip", z.ZodTypeAny, {
                good: number;
                meh: number;
            }, {
                good: number;
                meh: number;
            }>;
            h2: z.ZodObject<{
                good: z.ZodTuple<[z.ZodNumber, z.ZodNumber], null>;
                meh: z.ZodTuple<[z.ZodNumber, z.ZodNumber], null>;
            }, "strip", z.ZodTypeAny, {
                good: [number, number];
                meh: [number, number];
            }, {
                good: [number, number];
                meh: [number, number];
            }>;
            internalLinks: z.ZodObject<{
                good: z.ZodNumber;
                meh: z.ZodNumber;
            }, "strip", z.ZodTypeAny, {
                good: number;
                meh: number;
            }, {
                good: number;
                meh: number;
            }>;
            tags: z.ZodObject<{
                good: z.ZodTuple<[z.ZodNumber, z.ZodNumber], null>;
                mehMin: z.ZodNumber;
            }, "strip", z.ZodTypeAny, {
                good: [number, number];
                mehMin: number;
            }, {
                good: [number, number];
                mehMin: number;
            }>;
            heroAltWords: z.ZodObject<{
                good: z.ZodTuple<[z.ZodNumber, z.ZodNumber], null>;
            }, "strip", z.ZodTypeAny, {
                good: [number, number];
            }, {
                good: [number, number];
            }>;
            reading: z.ZodObject<{
                good: z.ZodTuple<[z.ZodNumber, z.ZodNumber], null>;
                mehMax: z.ZodNumber;
            }, "strip", z.ZodTypeAny, {
                good: [number, number];
                mehMax: number;
            }, {
                good: [number, number];
                mehMax: number;
            }>;
            internalLinkPrefixes: z.ZodArray<z.ZodString, "many">;
            referenceSectionNames: z.ZodArray<z.ZodString, "many">;
            evidenceTriggers: z.ZodArray<z.ZodString, "many">;
            badFilenameRe: z.ZodString;
        }, "strip", z.ZodTypeAny, {
            title: {
                good: [number, number];
                mehMax: number;
            };
            excerpt: {
                good: [number, number];
                meh: [number, number];
            };
            slugMaxLen: number;
            wordCount: {
                good: [number, number];
                mehMin: number;
            };
            bodyChars: {
                good: number;
                meh: number;
            };
            h2: {
                good: [number, number];
                meh: [number, number];
            };
            internalLinks: {
                good: number;
                meh: number;
            };
            tags: {
                good: [number, number];
                mehMin: number;
            };
            heroAltWords: {
                good: [number, number];
            };
            reading: {
                good: [number, number];
                mehMax: number;
            };
            internalLinkPrefixes: string[];
            referenceSectionNames: string[];
            evidenceTriggers: string[];
            badFilenameRe: string;
        }, {
            title: {
                good: [number, number];
                mehMax: number;
            };
            excerpt: {
                good: [number, number];
                meh: [number, number];
            };
            slugMaxLen: number;
            wordCount: {
                good: [number, number];
                mehMin: number;
            };
            bodyChars: {
                good: number;
                meh: number;
            };
            h2: {
                good: [number, number];
                meh: [number, number];
            };
            internalLinks: {
                good: number;
                meh: number;
            };
            tags: {
                good: [number, number];
                mehMin: number;
            };
            heroAltWords: {
                good: [number, number];
            };
            reading: {
                good: [number, number];
                mehMax: number;
            };
            internalLinkPrefixes: string[];
            referenceSectionNames: string[];
            evidenceTriggers: string[];
            badFilenameRe: string;
        }>;
    }, "strip", z.ZodTypeAny, {
        seo: {
            title: {
                good: [number, number];
                mehMax: number;
            };
            excerpt: {
                good: [number, number];
                meh: [number, number];
            };
            slugMaxLen: number;
            wordCount: {
                good: [number, number];
                mehMin: number;
            };
            bodyChars: {
                good: number;
                meh: number;
            };
            h2: {
                good: [number, number];
                meh: [number, number];
            };
            internalLinks: {
                good: number;
                meh: number;
            };
            tags: {
                good: [number, number];
                mehMin: number;
            };
            heroAltWords: {
                good: [number, number];
            };
            reading: {
                good: [number, number];
                mehMax: number;
            };
            internalLinkPrefixes: string[];
            referenceSectionNames: string[];
            evidenceTriggers: string[];
            badFilenameRe: string;
        };
        geo: {
            floor: number;
            checks: {
                id: string;
                label: string;
                weight: number;
                kind: "regexCount" | "regexPer1k" | "questionH2";
                thresholds: [number, number];
                patterns?: string[] | undefined;
                flags?: string | undefined;
                target?: "cleaned" | "body" | undefined;
            }[];
        };
    }, {
        seo: {
            title: {
                good: [number, number];
                mehMax: number;
            };
            excerpt: {
                good: [number, number];
                meh: [number, number];
            };
            slugMaxLen: number;
            wordCount: {
                good: [number, number];
                mehMin: number;
            };
            bodyChars: {
                good: number;
                meh: number;
            };
            h2: {
                good: [number, number];
                meh: [number, number];
            };
            internalLinks: {
                good: number;
                meh: number;
            };
            tags: {
                good: [number, number];
                mehMin: number;
            };
            heroAltWords: {
                good: [number, number];
            };
            reading: {
                good: [number, number];
                mehMax: number;
            };
            internalLinkPrefixes: string[];
            referenceSectionNames: string[];
            evidenceTriggers: string[];
            badFilenameRe: string;
        };
        geo: {
            floor: number;
            checks: {
                id: string;
                label: string;
                weight: number;
                kind: "regexCount" | "regexPer1k" | "questionH2";
                thresholds: [number, number];
                patterns?: string[] | undefined;
                flags?: string | undefined;
                target?: "cleaned" | "body" | undefined;
            }[];
        };
    }>;
    citation: z.ZodObject<{
        policy: z.ZodEnum<["direct-source-urls", "search-urls-only", "verifier-required"]>;
        forbiddenPatterns: z.ZodArray<z.ZodString, "many">;
        referenceFormat: z.ZodString;
        verifier: z.ZodObject<{
            kind: z.ZodEnum<["none", "cite8", "primary-source"]>;
            baseUrl: z.ZodOptional<z.ZodString>;
        }, "strip", z.ZodTypeAny, {
            kind: "none" | "cite8" | "primary-source";
            baseUrl?: string | undefined;
        }, {
            kind: "none" | "cite8" | "primary-source";
            baseUrl?: string | undefined;
        }>;
    }, "strip", z.ZodTypeAny, {
        policy: "direct-source-urls" | "search-urls-only" | "verifier-required";
        forbiddenPatterns: string[];
        referenceFormat: string;
        verifier: {
            kind: "none" | "cite8" | "primary-source";
            baseUrl?: string | undefined;
        };
    }, {
        policy: "direct-source-urls" | "search-urls-only" | "verifier-required";
        forbiddenPatterns: string[];
        referenceFormat: string;
        verifier: {
            kind: "none" | "cite8" | "primary-source";
            baseUrl?: string | undefined;
        };
    }>;
    aeo: z.ZodObject<{
        brandMentions: z.ZodArray<z.ZodString, "many">;
        localSearchLocation: z.ZodOptional<z.ZodString>;
        querySet: z.ZodArray<z.ZodObject<{
            id: z.ZodString;
            query: z.ZodString;
            tags: z.ZodArray<z.ZodString, "many">;
        }, "strip", z.ZodTypeAny, {
            id: string;
            tags: string[];
            query: string;
        }, {
            id: string;
            tags: string[];
            query: string;
        }>, "many">;
        engines: z.ZodArray<z.ZodEnum<["perplexity", "anthropic", "google-aio", "openai"]>, "many">;
        highPriorityTags: z.ZodArray<z.ZodString, "many">;
        maxSnapshots: z.ZodOptional<z.ZodNumber>;
    }, "strip", z.ZodTypeAny, {
        brandMentions: string[];
        querySet: {
            id: string;
            tags: string[];
            query: string;
        }[];
        engines: ("perplexity" | "anthropic" | "google-aio" | "openai")[];
        highPriorityTags: string[];
        localSearchLocation?: string | undefined;
        maxSnapshots?: number | undefined;
    }, {
        brandMentions: string[];
        querySet: {
            id: string;
            tags: string[];
            query: string;
        }[];
        engines: ("perplexity" | "anthropic" | "google-aio" | "openai")[];
        highPriorityTags: string[];
        localSearchLocation?: string | undefined;
        maxSnapshots?: number | undefined;
    }>;
    competitors: z.ZodOptional<z.ZodObject<{
        ourPlaceId: z.ZodOptional<z.ZodString>;
        ourName: z.ZodOptional<z.ZodString>;
        localPackLocation: z.ZodOptional<z.ZodString>;
        roster: z.ZodArray<z.ZodObject<{
            id: z.ZodString;
            name: z.ZodString;
            url: z.ZodString;
            placeId: z.ZodOptional<z.ZodString>;
            targetKeywords: z.ZodOptional<z.ZodArray<z.ZodString, "many">>;
        }, "strip", z.ZodTypeAny, {
            name: string;
            url: string;
            id: string;
            placeId?: string | undefined;
            targetKeywords?: string[] | undefined;
        }, {
            name: string;
            url: string;
            id: string;
            placeId?: string | undefined;
            targetKeywords?: string[] | undefined;
        }>, "many">;
        targetKeywords: z.ZodArray<z.ZodString, "many">;
        highValuePatterns: z.ZodOptional<z.ZodArray<z.ZodString, "many">>;
        skipPatterns: z.ZodOptional<z.ZodArray<z.ZodString, "many">>;
        templateVendors: z.ZodOptional<z.ZodArray<z.ZodObject<{
            name: z.ZodString;
            fingerprints: z.ZodArray<z.ZodString, "many">;
        }, "strip", z.ZodTypeAny, {
            name: string;
            fingerprints: string[];
        }, {
            name: string;
            fingerprints: string[];
        }>, "many">>;
    }, "strip", z.ZodTypeAny, {
        roster: {
            name: string;
            url: string;
            id: string;
            placeId?: string | undefined;
            targetKeywords?: string[] | undefined;
        }[];
        targetKeywords: string[];
        ourPlaceId?: string | undefined;
        ourName?: string | undefined;
        localPackLocation?: string | undefined;
        highValuePatterns?: string[] | undefined;
        skipPatterns?: string[] | undefined;
        templateVendors?: {
            name: string;
            fingerprints: string[];
        }[] | undefined;
    }, {
        roster: {
            name: string;
            url: string;
            id: string;
            placeId?: string | undefined;
            targetKeywords?: string[] | undefined;
        }[];
        targetKeywords: string[];
        ourPlaceId?: string | undefined;
        ourName?: string | undefined;
        localPackLocation?: string | undefined;
        highValuePatterns?: string[] | undefined;
        skipPatterns?: string[] | undefined;
        templateVendors?: {
            name: string;
            fingerprints: string[];
        }[] | undefined;
    }>>;
    strategy: z.ZodOptional<z.ZodObject<{
        thresholds: z.ZodObject<{
            real404MinRequests: z.ZodNumber;
            real404HighRequests: z.ZodNumber;
            serverError5xxMin: z.ZodNumber;
            serverError5xxHigh: z.ZodNumber;
            topContentPaths: z.ZodNumber;
            geoHighTopRank: z.ZodNumber;
            geoTargetMargin: z.ZodNumber;
            audioTopRank: z.ZodNumber;
            socialMinReferrers: z.ZodNumber;
            socialGapFraction: z.ZodNumber;
            socialGapFloor: z.ZodNumber;
            climbRankRange: z.ZodTuple<[z.ZodNumber, z.ZodNumber], null>;
            climbMax: z.ZodNumber;
            maxRecommendations: z.ZodNumber;
        }, "strip", z.ZodTypeAny, {
            real404MinRequests: number;
            real404HighRequests: number;
            serverError5xxMin: number;
            serverError5xxHigh: number;
            topContentPaths: number;
            geoHighTopRank: number;
            geoTargetMargin: number;
            audioTopRank: number;
            socialMinReferrers: number;
            socialGapFraction: number;
            socialGapFloor: number;
            climbRankRange: [number, number];
            climbMax: number;
            maxRecommendations: number;
        }, {
            real404MinRequests: number;
            real404HighRequests: number;
            serverError5xxMin: number;
            serverError5xxHigh: number;
            topContentPaths: number;
            geoHighTopRank: number;
            geoTargetMargin: number;
            audioTopRank: number;
            socialMinReferrers: number;
            socialGapFraction: number;
            socialGapFloor: number;
            climbRankRange: [number, number];
            climbMax: number;
            maxRecommendations: number;
        }>;
        siteRoute404Patterns: z.ZodArray<z.ZodString, "many">;
        articlePathPattern: z.ZodString;
        refererGroups: z.ZodObject<{
            social: z.ZodArray<z.ZodString, "many">;
            search: z.ZodArray<z.ZodString, "many">;
        }, "strip", z.ZodTypeAny, {
            social: string[];
            search: string[];
        }, {
            social: string[];
            search: string[];
        }>;
        liveCrawlPurpose: z.ZodString;
        deepLinks: z.ZodRecord<z.ZodString, z.ZodObject<{
            link: z.ZodString;
            linkLabel: z.ZodOptional<z.ZodString>;
        }, "strip", z.ZodTypeAny, {
            link: string;
            linkLabel?: string | undefined;
        }, {
            link: string;
            linkLabel?: string | undefined;
        }>>;
        copy: z.ZodRecord<z.ZodString, z.ZodObject<{
            title: z.ZodString;
            evidence: z.ZodString;
        }, "strip", z.ZodTypeAny, {
            title: string;
            evidence: string;
        }, {
            title: string;
            evidence: string;
        }>>;
    }, "strip", z.ZodTypeAny, {
        thresholds: {
            real404MinRequests: number;
            real404HighRequests: number;
            serverError5xxMin: number;
            serverError5xxHigh: number;
            topContentPaths: number;
            geoHighTopRank: number;
            geoTargetMargin: number;
            audioTopRank: number;
            socialMinReferrers: number;
            socialGapFraction: number;
            socialGapFloor: number;
            climbRankRange: [number, number];
            climbMax: number;
            maxRecommendations: number;
        };
        siteRoute404Patterns: string[];
        articlePathPattern: string;
        refererGroups: {
            social: string[];
            search: string[];
        };
        liveCrawlPurpose: string;
        deepLinks: Record<string, {
            link: string;
            linkLabel?: string | undefined;
        }>;
        copy: Record<string, {
            title: string;
            evidence: string;
        }>;
    }, {
        thresholds: {
            real404MinRequests: number;
            real404HighRequests: number;
            serverError5xxMin: number;
            serverError5xxHigh: number;
            topContentPaths: number;
            geoHighTopRank: number;
            geoTargetMargin: number;
            audioTopRank: number;
            socialMinReferrers: number;
            socialGapFraction: number;
            socialGapFloor: number;
            climbRankRange: [number, number];
            climbMax: number;
            maxRecommendations: number;
        };
        siteRoute404Patterns: string[];
        articlePathPattern: string;
        refererGroups: {
            social: string[];
            search: string[];
        };
        liveCrawlPurpose: string;
        deepLinks: Record<string, {
            link: string;
            linkLabel?: string | undefined;
        }>;
        copy: Record<string, {
            title: string;
            evidence: string;
        }>;
    }>>;
    drafting: z.ZodOptional<z.ZodObject<{
        models: z.ZodRecord<z.ZodString, z.ZodString>;
        defaultModel: z.ZodString;
        utilityModel: z.ZodString;
        draftFloor: z.ZodObject<{
            seo: z.ZodNumber;
            geo: z.ZodNumber;
        }, "strip", z.ZodTypeAny, {
            seo: number;
            geo: number;
        }, {
            seo: number;
            geo: number;
        }>;
        wordCountTarget: z.ZodTuple<[z.ZodNumber, z.ZodNumber], null>;
        bodyCharCeiling: z.ZodNumber;
        maxTokens: z.ZodObject<{
            brainstorm: z.ZodNumber;
            draft: z.ZodNumber;
            outline: z.ZodNumber;
            'draft-series': z.ZodNumber;
            'draft-series-article': z.ZodNumber;
            fixPass: z.ZodNumber;
            extractClaims: z.ZodNumber;
            chat: z.ZodNumber;
        }, "strip", z.ZodTypeAny, {
            brainstorm: number;
            draft: number;
            outline: number;
            'draft-series': number;
            'draft-series-article': number;
            fixPass: number;
            extractClaims: number;
            chat: number;
        }, {
            brainstorm: number;
            draft: number;
            outline: number;
            'draft-series': number;
            'draft-series-article': number;
            fixPass: number;
            extractClaims: number;
            chat: number;
        }>;
        promptOverrides: z.ZodOptional<z.ZodRecord<z.ZodString, z.ZodString>>;
    }, "strip", z.ZodTypeAny, {
        models: Record<string, string>;
        defaultModel: string;
        utilityModel: string;
        draftFloor: {
            seo: number;
            geo: number;
        };
        wordCountTarget: [number, number];
        bodyCharCeiling: number;
        maxTokens: {
            brainstorm: number;
            draft: number;
            outline: number;
            'draft-series': number;
            'draft-series-article': number;
            fixPass: number;
            extractClaims: number;
            chat: number;
        };
        promptOverrides?: Record<string, string> | undefined;
    }, {
        models: Record<string, string>;
        defaultModel: string;
        utilityModel: string;
        draftFloor: {
            seo: number;
            geo: number;
        };
        wordCountTarget: [number, number];
        bodyCharCeiling: number;
        maxTokens: {
            brainstorm: number;
            draft: number;
            outline: number;
            'draft-series': number;
            'draft-series-article': number;
            fixPass: number;
            extractClaims: number;
            chat: number;
        };
        promptOverrides?: Record<string, string> | undefined;
    }>>;
    amplify: z.ZodOptional<z.ZodObject<{
        channels: z.ZodArray<z.ZodObject<{
            id: z.ZodString;
            label: z.ZodString;
            guidance: z.ZodString;
            fieldDescription: z.ZodString;
            utm: z.ZodOptional<z.ZodString>;
            noUrl: z.ZodOptional<z.ZodBoolean>;
        }, "strip", z.ZodTypeAny, {
            id: string;
            label: string;
            guidance: string;
            fieldDescription: string;
            utm?: string | undefined;
            noUrl?: boolean | undefined;
        }, {
            id: string;
            label: string;
            guidance: string;
            fieldDescription: string;
            utm?: string | undefined;
            noUrl?: boolean | undefined;
        }>, "many">;
        systemPreamble: z.ZodString;
        carouselSchemes: z.ZodArray<z.ZodObject<{
            id: z.ZodString;
            label: z.ZodString;
            bg: z.ZodString;
            fg: z.ZodString;
            accent: z.ZodString;
        }, "strip", z.ZodTypeAny, {
            id: string;
            label: string;
            bg: string;
            fg: string;
            accent: string;
        }, {
            id: string;
            label: string;
            bg: string;
            fg: string;
            accent: string;
        }>, "many">;
        carouselGuidance: z.ZodString;
        newsletterGuidance: z.ZodString;
        carouselStateDir: z.ZodOptional<z.ZodString>;
    }, "strip", z.ZodTypeAny, {
        channels: {
            id: string;
            label: string;
            guidance: string;
            fieldDescription: string;
            utm?: string | undefined;
            noUrl?: boolean | undefined;
        }[];
        systemPreamble: string;
        carouselSchemes: {
            id: string;
            label: string;
            bg: string;
            fg: string;
            accent: string;
        }[];
        carouselGuidance: string;
        newsletterGuidance: string;
        carouselStateDir?: string | undefined;
    }, {
        channels: {
            id: string;
            label: string;
            guidance: string;
            fieldDescription: string;
            utm?: string | undefined;
            noUrl?: boolean | undefined;
        }[];
        systemPreamble: string;
        carouselSchemes: {
            id: string;
            label: string;
            bg: string;
            fg: string;
            accent: string;
        }[];
        carouselGuidance: string;
        newsletterGuidance: string;
        carouselStateDir?: string | undefined;
    }>>;
    media: z.ZodOptional<z.ZodObject<{
        narration: z.ZodObject<{
            voiceId: z.ZodString;
            model: z.ZodString;
            voiceSettings: z.ZodObject<{
                stability: z.ZodNumber;
                similarity_boost: z.ZodNumber;
                style: z.ZodNumber;
                use_speaker_boost: z.ZodBoolean;
            }, "strip", z.ZodTypeAny, {
                stability: number;
                similarity_boost: number;
                style: number;
                use_speaker_boost: boolean;
            }, {
                stability: number;
                similarity_boost: number;
                style: number;
                use_speaker_boost: boolean;
            }>;
            outroText: z.ZodString;
            pronunciationOverrides: z.ZodArray<z.ZodObject<{
                word: z.ZodString;
                ipa: z.ZodString;
            }, "strip", z.ZodTypeAny, {
                word: string;
                ipa: string;
            }, {
                word: string;
                ipa: string;
            }>, "many">;
            abbreviationExpansions: z.ZodArray<z.ZodObject<{
                abbr: z.ZodString;
                full: z.ZodString;
            }, "strip", z.ZodTypeAny, {
                abbr: string;
                full: string;
            }, {
                abbr: string;
                full: string;
            }>, "many">;
            chunkChars: z.ZodNumber;
            maxChars: z.ZodNumber;
            referenceSectionNames: z.ZodArray<z.ZodString, "many">;
        }, "strip", z.ZodTypeAny, {
            referenceSectionNames: string[];
            voiceId: string;
            model: string;
            voiceSettings: {
                stability: number;
                similarity_boost: number;
                style: number;
                use_speaker_boost: boolean;
            };
            outroText: string;
            pronunciationOverrides: {
                word: string;
                ipa: string;
            }[];
            abbreviationExpansions: {
                abbr: string;
                full: string;
            }[];
            chunkChars: number;
            maxChars: number;
        }, {
            referenceSectionNames: string[];
            voiceId: string;
            model: string;
            voiceSettings: {
                stability: number;
                similarity_boost: number;
                style: number;
                use_speaker_boost: boolean;
            };
            outroText: string;
            pronunciationOverrides: {
                word: string;
                ipa: string;
            }[];
            abbreviationExpansions: {
                abbr: string;
                full: string;
            }[];
            chunkChars: number;
            maxChars: number;
        }>;
        heroImage: z.ZodObject<{
            model: z.ZodString;
            size: z.ZodString;
            quality: z.ZodString;
            promptTemplate: z.ZodString;
            proposalSystem: z.ZodString;
        }, "strip", z.ZodTypeAny, {
            model: string;
            size: string;
            quality: string;
            promptTemplate: string;
            proposalSystem: string;
        }, {
            model: string;
            size: string;
            quality: string;
            promptTemplate: string;
            proposalSystem: string;
        }>;
        podcast: z.ZodObject<{
            title: z.ZodString;
            subtitle: z.ZodString;
            description: z.ZodString;
            author: z.ZodString;
            ownerEmail: z.ZodString;
            category: z.ZodString;
            subcategory: z.ZodOptional<z.ZodString>;
            copyright: z.ZodOptional<z.ZodString>;
            language: z.ZodOptional<z.ZodString>;
            coverImage: z.ZodString;
            charsPerMinute: z.ZodOptional<z.ZodNumber>;
            trailer: z.ZodOptional<z.ZodObject<{
                title: z.ZodString;
                audioPath: z.ZodString;
                audioSize: z.ZodNumber;
                duration: z.ZodString;
                pubDate: z.ZodString;
                summary: z.ZodString;
            }, "strip", z.ZodTypeAny, {
                title: string;
                audioPath: string;
                audioSize: number;
                duration: string;
                pubDate: string;
                summary: string;
            }, {
                title: string;
                audioPath: string;
                audioSize: number;
                duration: string;
                pubDate: string;
                summary: string;
            }>>;
        }, "strip", z.ZodTypeAny, {
            title: string;
            subtitle: string;
            description: string;
            author: string;
            ownerEmail: string;
            category: string;
            coverImage: string;
            subcategory?: string | undefined;
            copyright?: string | undefined;
            language?: string | undefined;
            charsPerMinute?: number | undefined;
            trailer?: {
                title: string;
                audioPath: string;
                audioSize: number;
                duration: string;
                pubDate: string;
                summary: string;
            } | undefined;
        }, {
            title: string;
            subtitle: string;
            description: string;
            author: string;
            ownerEmail: string;
            category: string;
            coverImage: string;
            subcategory?: string | undefined;
            copyright?: string | undefined;
            language?: string | undefined;
            charsPerMinute?: number | undefined;
            trailer?: {
                title: string;
                audioPath: string;
                audioSize: number;
                duration: string;
                pubDate: string;
                summary: string;
            } | undefined;
        }>;
    }, "strip", z.ZodTypeAny, {
        narration: {
            referenceSectionNames: string[];
            voiceId: string;
            model: string;
            voiceSettings: {
                stability: number;
                similarity_boost: number;
                style: number;
                use_speaker_boost: boolean;
            };
            outroText: string;
            pronunciationOverrides: {
                word: string;
                ipa: string;
            }[];
            abbreviationExpansions: {
                abbr: string;
                full: string;
            }[];
            chunkChars: number;
            maxChars: number;
        };
        heroImage: {
            model: string;
            size: string;
            quality: string;
            promptTemplate: string;
            proposalSystem: string;
        };
        podcast: {
            title: string;
            subtitle: string;
            description: string;
            author: string;
            ownerEmail: string;
            category: string;
            coverImage: string;
            subcategory?: string | undefined;
            copyright?: string | undefined;
            language?: string | undefined;
            charsPerMinute?: number | undefined;
            trailer?: {
                title: string;
                audioPath: string;
                audioSize: number;
                duration: string;
                pubDate: string;
                summary: string;
            } | undefined;
        };
    }, {
        narration: {
            referenceSectionNames: string[];
            voiceId: string;
            model: string;
            voiceSettings: {
                stability: number;
                similarity_boost: number;
                style: number;
                use_speaker_boost: boolean;
            };
            outroText: string;
            pronunciationOverrides: {
                word: string;
                ipa: string;
            }[];
            abbreviationExpansions: {
                abbr: string;
                full: string;
            }[];
            chunkChars: number;
            maxChars: number;
        };
        heroImage: {
            model: string;
            size: string;
            quality: string;
            promptTemplate: string;
            proposalSystem: string;
        };
        podcast: {
            title: string;
            subtitle: string;
            description: string;
            author: string;
            ownerEmail: string;
            category: string;
            coverImage: string;
            subcategory?: string | undefined;
            copyright?: string | undefined;
            language?: string | undefined;
            charsPerMinute?: number | undefined;
            trailer?: {
                title: string;
                audioPath: string;
                audioSize: number;
                duration: string;
                pubDate: string;
                summary: string;
            } | undefined;
        };
    }>>;
    analytics: z.ZodOptional<z.ZodObject<{
        aiBotList: z.ZodArray<z.ZodObject<{
            match: z.ZodString;
            bot: z.ZodString;
            engine: z.ZodString;
            purpose: z.ZodEnum<["train", "index", "live"]>;
        }, "strip", z.ZodTypeAny, {
            match: string;
            bot: string;
            engine: string;
            purpose: "train" | "index" | "live";
        }, {
            match: string;
            bot: string;
            engine: string;
            purpose: "train" | "index" | "live";
        }>, "many">;
        refererChannelMap: z.ZodArray<z.ZodObject<{
            label: z.ZodOptional<z.ZodString>;
            needles: z.ZodArray<z.ZodString, "many">;
            drop: z.ZodOptional<z.ZodBoolean>;
        }, "strip", z.ZodTypeAny, {
            needles: string[];
            label?: string | undefined;
            drop?: boolean | undefined;
        }, {
            needles: string[];
            label?: string | undefined;
            drop?: boolean | undefined;
        }>, "many">;
        directLabel: z.ZodString;
        articlePathPattern: z.ZodString;
        assetPathPattern: z.ZodString;
        botUaPattern: z.ZodString;
        siteRoute404Patterns: z.ZodArray<z.ZodString, "many">;
        cloudflare: z.ZodOptional<z.ZodObject<{
            zoneId: z.ZodOptional<z.ZodString>;
            accountId: z.ZodOptional<z.ZodString>;
            endpoint: z.ZodOptional<z.ZodString>;
        }, "strip", z.ZodTypeAny, {
            zoneId?: string | undefined;
            accountId?: string | undefined;
            endpoint?: string | undefined;
        }, {
            zoneId?: string | undefined;
            accountId?: string | undefined;
            endpoint?: string | undefined;
        }>>;
        windowDays: z.ZodNumber;
        maxDailySnapshots: z.ZodNumber;
    }, "strip", z.ZodTypeAny, {
        siteRoute404Patterns: string[];
        articlePathPattern: string;
        aiBotList: {
            match: string;
            bot: string;
            engine: string;
            purpose: "train" | "index" | "live";
        }[];
        refererChannelMap: {
            needles: string[];
            label?: string | undefined;
            drop?: boolean | undefined;
        }[];
        directLabel: string;
        assetPathPattern: string;
        botUaPattern: string;
        windowDays: number;
        maxDailySnapshots: number;
        cloudflare?: {
            zoneId?: string | undefined;
            accountId?: string | undefined;
            endpoint?: string | undefined;
        } | undefined;
    }, {
        siteRoute404Patterns: string[];
        articlePathPattern: string;
        aiBotList: {
            match: string;
            bot: string;
            engine: string;
            purpose: "train" | "index" | "live";
        }[];
        refererChannelMap: {
            needles: string[];
            label?: string | undefined;
            drop?: boolean | undefined;
        }[];
        directLabel: string;
        assetPathPattern: string;
        botUaPattern: string;
        windowDays: number;
        maxDailySnapshots: number;
        cloudflare?: {
            zoneId?: string | undefined;
            accountId?: string | undefined;
            endpoint?: string | undefined;
        } | undefined;
    }>>;
    entityPresence: z.ZodOptional<z.ZodObject<{
        sources: z.ZodArray<z.ZodObject<{
            id: z.ZodString;
            label: z.ZodString;
            hostNeedles: z.ZodArray<z.ZodString, "many">;
            weight: z.ZodNumber;
            napConsistencyChecked: z.ZodOptional<z.ZodBoolean>;
        }, "strip", z.ZodTypeAny, {
            id: string;
            label: string;
            weight: number;
            hostNeedles: string[];
            napConsistencyChecked?: boolean | undefined;
        }, {
            id: string;
            label: string;
            weight: number;
            hostNeedles: string[];
            napConsistencyChecked?: boolean | undefined;
        }>, "many">;
        engineAffinities: z.ZodArray<z.ZodObject<{
            engine: z.ZodString;
            affinity: z.ZodRecord<z.ZodString, z.ZodNumber>;
            note: z.ZodOptional<z.ZodString>;
        }, "strip", z.ZodTypeAny, {
            engine: string;
            affinity: Record<string, number>;
            note?: string | undefined;
        }, {
            engine: string;
            affinity: Record<string, number>;
            note?: string | undefined;
        }>, "many">;
        consistencyTargets: z.ZodOptional<z.ZodObject<{
            name: z.ZodOptional<z.ZodString>;
            nap: z.ZodRecord<z.ZodString, z.ZodString>;
        }, "strip", z.ZodTypeAny, {
            nap: Record<string, string>;
            name?: string | undefined;
        }, {
            nap: Record<string, string>;
            name?: string | undefined;
        }>>;
        establishedThreshold: z.ZodOptional<z.ZodNumber>;
    }, "strip", z.ZodTypeAny, {
        sources: {
            id: string;
            label: string;
            weight: number;
            hostNeedles: string[];
            napConsistencyChecked?: boolean | undefined;
        }[];
        engineAffinities: {
            engine: string;
            affinity: Record<string, number>;
            note?: string | undefined;
        }[];
        consistencyTargets?: {
            nap: Record<string, string>;
            name?: string | undefined;
        } | undefined;
        establishedThreshold?: number | undefined;
    }, {
        sources: {
            id: string;
            label: string;
            weight: number;
            hostNeedles: string[];
            napConsistencyChecked?: boolean | undefined;
        }[];
        engineAffinities: {
            engine: string;
            affinity: Record<string, number>;
            note?: string | undefined;
        }[];
        consistencyTargets?: {
            nap: Record<string, string>;
            name?: string | undefined;
        } | undefined;
        establishedThreshold?: number | undefined;
    }>>;
    schema: z.ZodObject<{
        orgType: z.ZodArray<z.ZodString, "many">;
        org: z.ZodObject<{
            name: z.ZodString;
            url: z.ZodString;
            logoUrl: z.ZodOptional<z.ZodString>;
            sameAs: z.ZodOptional<z.ZodArray<z.ZodString, "many">>;
            extra: z.ZodOptional<z.ZodRecord<z.ZodString, z.ZodUnknown>>;
        }, "strip", z.ZodTypeAny, {
            name: string;
            url: string;
            logoUrl?: string | undefined;
            sameAs?: string[] | undefined;
            extra?: Record<string, unknown> | undefined;
        }, {
            name: string;
            url: string;
            logoUrl?: string | undefined;
            sameAs?: string[] | undefined;
            extra?: Record<string, unknown> | undefined;
        }>;
        articleTypes: z.ZodArray<z.ZodString, "many">;
        publishingPrinciplesUrl: z.ZodOptional<z.ZodString>;
        articleGraph: z.ZodOptional<z.ZodObject<{
            reviewerSchemaId: z.ZodOptional<z.ZodString>;
            emitLastReviewed: z.ZodOptional<z.ZodBoolean>;
            publishingPrinciplesUrl: z.ZodOptional<z.ZodString>;
            heroImageDimensions: z.ZodOptional<z.ZodObject<{
                width: z.ZodNumber;
                height: z.ZodNumber;
            }, "strip", z.ZodTypeAny, {
                width: number;
                height: number;
            }, {
                width: number;
                height: number;
            }>>;
            sourceEpisodeSeriesName: z.ZodOptional<z.ZodString>;
        }, "strip", z.ZodTypeAny, {
            publishingPrinciplesUrl?: string | undefined;
            reviewerSchemaId?: string | undefined;
            emitLastReviewed?: boolean | undefined;
            heroImageDimensions?: {
                width: number;
                height: number;
            } | undefined;
            sourceEpisodeSeriesName?: string | undefined;
        }, {
            publishingPrinciplesUrl?: string | undefined;
            reviewerSchemaId?: string | undefined;
            emitLastReviewed?: boolean | undefined;
            heroImageDimensions?: {
                width: number;
                height: number;
            } | undefined;
            sourceEpisodeSeriesName?: string | undefined;
        }>>;
        emitLlmsTxt: z.ZodOptional<z.ZodBoolean>;
        llmsTxt: z.ZodOptional<z.ZodObject<{
            summary: z.ZodOptional<z.ZodString>;
            intro: z.ZodOptional<z.ZodString>;
            sections: z.ZodOptional<z.ZodArray<z.ZodObject<{
                heading: z.ZodString;
                items: z.ZodArray<z.ZodUnion<[z.ZodString, z.ZodObject<{
                    label: z.ZodString;
                    url: z.ZodOptional<z.ZodString>;
                    note: z.ZodOptional<z.ZodString>;
                }, "strip", z.ZodTypeAny, {
                    label: string;
                    url?: string | undefined;
                    note?: string | undefined;
                }, {
                    label: string;
                    url?: string | undefined;
                    note?: string | undefined;
                }>]>, "many">;
            }, "strip", z.ZodTypeAny, {
                heading: string;
                items: (string | {
                    label: string;
                    url?: string | undefined;
                    note?: string | undefined;
                })[];
            }, {
                heading: string;
                items: (string | {
                    label: string;
                    url?: string | undefined;
                    note?: string | undefined;
                })[];
            }>, "many">>;
        }, "strip", z.ZodTypeAny, {
            summary?: string | undefined;
            intro?: string | undefined;
            sections?: {
                heading: string;
                items: (string | {
                    label: string;
                    url?: string | undefined;
                    note?: string | undefined;
                })[];
            }[] | undefined;
        }, {
            summary?: string | undefined;
            intro?: string | undefined;
            sections?: {
                heading: string;
                items: (string | {
                    label: string;
                    url?: string | undefined;
                    note?: string | undefined;
                })[];
            }[] | undefined;
        }>>;
    }, "strip", z.ZodTypeAny, {
        orgType: string[];
        org: {
            name: string;
            url: string;
            logoUrl?: string | undefined;
            sameAs?: string[] | undefined;
            extra?: Record<string, unknown> | undefined;
        };
        articleTypes: string[];
        publishingPrinciplesUrl?: string | undefined;
        articleGraph?: {
            publishingPrinciplesUrl?: string | undefined;
            reviewerSchemaId?: string | undefined;
            emitLastReviewed?: boolean | undefined;
            heroImageDimensions?: {
                width: number;
                height: number;
            } | undefined;
            sourceEpisodeSeriesName?: string | undefined;
        } | undefined;
        emitLlmsTxt?: boolean | undefined;
        llmsTxt?: {
            summary?: string | undefined;
            intro?: string | undefined;
            sections?: {
                heading: string;
                items: (string | {
                    label: string;
                    url?: string | undefined;
                    note?: string | undefined;
                })[];
            }[] | undefined;
        } | undefined;
    }, {
        orgType: string[];
        org: {
            name: string;
            url: string;
            logoUrl?: string | undefined;
            sameAs?: string[] | undefined;
            extra?: Record<string, unknown> | undefined;
        };
        articleTypes: string[];
        publishingPrinciplesUrl?: string | undefined;
        articleGraph?: {
            publishingPrinciplesUrl?: string | undefined;
            reviewerSchemaId?: string | undefined;
            emitLastReviewed?: boolean | undefined;
            heroImageDimensions?: {
                width: number;
                height: number;
            } | undefined;
            sourceEpisodeSeriesName?: string | undefined;
        } | undefined;
        emitLlmsTxt?: boolean | undefined;
        llmsTxt?: {
            summary?: string | undefined;
            intro?: string | undefined;
            sections?: {
                heading: string;
                items: (string | {
                    label: string;
                    url?: string | undefined;
                    note?: string | undefined;
                })[];
            }[] | undefined;
        } | undefined;
    }>;
    compliance: z.ZodOptional<z.ZodObject<{
        pack: z.ZodString;
        reviewResponseRules: z.ZodOptional<z.ZodArray<z.ZodString, "many">>;
        requireHumanReviewTags: z.ZodOptional<z.ZodArray<z.ZodString, "many">>;
    }, "strip", z.ZodTypeAny, {
        pack: string;
        reviewResponseRules?: string[] | undefined;
        requireHumanReviewTags?: string[] | undefined;
    }, {
        pack: string;
        reviewResponseRules?: string[] | undefined;
        requireHumanReviewTags?: string[] | undefined;
    }>>;
    capabilities: z.ZodObject<{
        drafting: z.ZodOptional<z.ZodBoolean>;
        amplify: z.ZodOptional<z.ZodBoolean>;
        audio: z.ZodOptional<z.ZodBoolean>;
        heroImages: z.ZodOptional<z.ZodBoolean>;
        competitiveIntel: z.ZodOptional<z.ZodBoolean>;
        engagementAnalytics: z.ZodOptional<z.ZodBoolean>;
        entityPresence: z.ZodOptional<z.ZodBoolean>;
    }, "strip", z.ZodTypeAny, {
        drafting?: boolean | undefined;
        amplify?: boolean | undefined;
        entityPresence?: boolean | undefined;
        audio?: boolean | undefined;
        heroImages?: boolean | undefined;
        competitiveIntel?: boolean | undefined;
        engagementAnalytics?: boolean | undefined;
    }, {
        drafting?: boolean | undefined;
        amplify?: boolean | undefined;
        entityPresence?: boolean | undefined;
        audio?: boolean | undefined;
        heroImages?: boolean | undefined;
        competitiveIntel?: boolean | undefined;
        engagementAnalytics?: boolean | undefined;
    }>;
    services: z.ZodObject<{
        store: z.ZodEnum<["github", "fs"]>;
        contentDir: z.ZodOptional<z.ZodString>;
        analytics: z.ZodOptional<z.ZodEnum<["cloudflare", "none"]>>;
        requiredEnv: z.ZodArray<z.ZodString, "many">;
    }, "strip", z.ZodTypeAny, {
        store: "github" | "fs";
        requiredEnv: string[];
        analytics?: "none" | "cloudflare" | undefined;
        contentDir?: string | undefined;
    }, {
        store: "github" | "fs";
        requiredEnv: string[];
        analytics?: "none" | "cloudflare" | undefined;
        contentDir?: string | undefined;
    }>;
}, "strip", z.ZodTypeAny, {
    brand: {
        name: string;
        siteUrl: string;
        logoUrl?: string | undefined;
        nap?: {
            placeId?: string | undefined;
            address?: string | undefined;
            city?: string | undefined;
            region?: string | undefined;
            postalCode?: string | undefined;
            phone?: string | undefined;
        } | undefined;
        tagline?: string | undefined;
        geoFraming?: string | undefined;
        brandColors?: Record<string, string> | undefined;
    };
    authors: {
        name: string;
        slug: string;
        schemaId: string;
        profile: {
            name: string;
            url?: string | undefined;
            sameAs?: string[] | undefined;
            extra?: Record<string, unknown> | undefined;
            jobTitle?: string | undefined;
            image?: string | undefined;
            knowsAbout?: string[] | undefined;
            credential?: string | undefined;
            alumniOf?: string[] | undefined;
            memberOf?: string[] | undefined;
            awards?: string[] | undefined;
        };
        title?: string | undefined;
        isPrimary?: boolean | undefined;
    }[];
    voice: {
        persona: string;
        bannedTopics: string[];
        bannedPhrasings: string[];
        rules: string[];
        voiceAnchorUrls: string[];
        readingGradeBand: [number, number];
    };
    content: {
        categories: string[];
        categoryTargets: Record<string, number>;
        defaultAuthorSlug: string;
        timezone: string;
        lifecycle?: {
            docReviewed?: boolean | undefined;
        } | undefined;
    };
    scoring: {
        seo: {
            title: {
                good: [number, number];
                mehMax: number;
            };
            excerpt: {
                good: [number, number];
                meh: [number, number];
            };
            slugMaxLen: number;
            wordCount: {
                good: [number, number];
                mehMin: number;
            };
            bodyChars: {
                good: number;
                meh: number;
            };
            h2: {
                good: [number, number];
                meh: [number, number];
            };
            internalLinks: {
                good: number;
                meh: number;
            };
            tags: {
                good: [number, number];
                mehMin: number;
            };
            heroAltWords: {
                good: [number, number];
            };
            reading: {
                good: [number, number];
                mehMax: number;
            };
            internalLinkPrefixes: string[];
            referenceSectionNames: string[];
            evidenceTriggers: string[];
            badFilenameRe: string;
        };
        geo: {
            floor: number;
            checks: {
                id: string;
                label: string;
                weight: number;
                kind: "regexCount" | "regexPer1k" | "questionH2";
                thresholds: [number, number];
                patterns?: string[] | undefined;
                flags?: string | undefined;
                target?: "cleaned" | "body" | undefined;
            }[];
        };
    };
    citation: {
        policy: "direct-source-urls" | "search-urls-only" | "verifier-required";
        forbiddenPatterns: string[];
        referenceFormat: string;
        verifier: {
            kind: "none" | "cite8" | "primary-source";
            baseUrl?: string | undefined;
        };
    };
    aeo: {
        brandMentions: string[];
        querySet: {
            id: string;
            tags: string[];
            query: string;
        }[];
        engines: ("perplexity" | "anthropic" | "google-aio" | "openai")[];
        highPriorityTags: string[];
        localSearchLocation?: string | undefined;
        maxSnapshots?: number | undefined;
    };
    schema: {
        orgType: string[];
        org: {
            name: string;
            url: string;
            logoUrl?: string | undefined;
            sameAs?: string[] | undefined;
            extra?: Record<string, unknown> | undefined;
        };
        articleTypes: string[];
        publishingPrinciplesUrl?: string | undefined;
        articleGraph?: {
            publishingPrinciplesUrl?: string | undefined;
            reviewerSchemaId?: string | undefined;
            emitLastReviewed?: boolean | undefined;
            heroImageDimensions?: {
                width: number;
                height: number;
            } | undefined;
            sourceEpisodeSeriesName?: string | undefined;
        } | undefined;
        emitLlmsTxt?: boolean | undefined;
        llmsTxt?: {
            summary?: string | undefined;
            intro?: string | undefined;
            sections?: {
                heading: string;
                items: (string | {
                    label: string;
                    url?: string | undefined;
                    note?: string | undefined;
                })[];
            }[] | undefined;
        } | undefined;
    };
    capabilities: {
        drafting?: boolean | undefined;
        amplify?: boolean | undefined;
        entityPresence?: boolean | undefined;
        audio?: boolean | undefined;
        heroImages?: boolean | undefined;
        competitiveIntel?: boolean | undefined;
        engagementAnalytics?: boolean | undefined;
    };
    services: {
        store: "github" | "fs";
        requiredEnv: string[];
        analytics?: "none" | "cloudflare" | undefined;
        contentDir?: string | undefined;
    };
    competitors?: {
        roster: {
            name: string;
            url: string;
            id: string;
            placeId?: string | undefined;
            targetKeywords?: string[] | undefined;
        }[];
        targetKeywords: string[];
        ourPlaceId?: string | undefined;
        ourName?: string | undefined;
        localPackLocation?: string | undefined;
        highValuePatterns?: string[] | undefined;
        skipPatterns?: string[] | undefined;
        templateVendors?: {
            name: string;
            fingerprints: string[];
        }[] | undefined;
    } | undefined;
    strategy?: {
        thresholds: {
            real404MinRequests: number;
            real404HighRequests: number;
            serverError5xxMin: number;
            serverError5xxHigh: number;
            topContentPaths: number;
            geoHighTopRank: number;
            geoTargetMargin: number;
            audioTopRank: number;
            socialMinReferrers: number;
            socialGapFraction: number;
            socialGapFloor: number;
            climbRankRange: [number, number];
            climbMax: number;
            maxRecommendations: number;
        };
        siteRoute404Patterns: string[];
        articlePathPattern: string;
        refererGroups: {
            social: string[];
            search: string[];
        };
        liveCrawlPurpose: string;
        deepLinks: Record<string, {
            link: string;
            linkLabel?: string | undefined;
        }>;
        copy: Record<string, {
            title: string;
            evidence: string;
        }>;
    } | undefined;
    drafting?: {
        models: Record<string, string>;
        defaultModel: string;
        utilityModel: string;
        draftFloor: {
            seo: number;
            geo: number;
        };
        wordCountTarget: [number, number];
        bodyCharCeiling: number;
        maxTokens: {
            brainstorm: number;
            draft: number;
            outline: number;
            'draft-series': number;
            'draft-series-article': number;
            fixPass: number;
            extractClaims: number;
            chat: number;
        };
        promptOverrides?: Record<string, string> | undefined;
    } | undefined;
    amplify?: {
        channels: {
            id: string;
            label: string;
            guidance: string;
            fieldDescription: string;
            utm?: string | undefined;
            noUrl?: boolean | undefined;
        }[];
        systemPreamble: string;
        carouselSchemes: {
            id: string;
            label: string;
            bg: string;
            fg: string;
            accent: string;
        }[];
        carouselGuidance: string;
        newsletterGuidance: string;
        carouselStateDir?: string | undefined;
    } | undefined;
    media?: {
        narration: {
            referenceSectionNames: string[];
            voiceId: string;
            model: string;
            voiceSettings: {
                stability: number;
                similarity_boost: number;
                style: number;
                use_speaker_boost: boolean;
            };
            outroText: string;
            pronunciationOverrides: {
                word: string;
                ipa: string;
            }[];
            abbreviationExpansions: {
                abbr: string;
                full: string;
            }[];
            chunkChars: number;
            maxChars: number;
        };
        heroImage: {
            model: string;
            size: string;
            quality: string;
            promptTemplate: string;
            proposalSystem: string;
        };
        podcast: {
            title: string;
            subtitle: string;
            description: string;
            author: string;
            ownerEmail: string;
            category: string;
            coverImage: string;
            subcategory?: string | undefined;
            copyright?: string | undefined;
            language?: string | undefined;
            charsPerMinute?: number | undefined;
            trailer?: {
                title: string;
                audioPath: string;
                audioSize: number;
                duration: string;
                pubDate: string;
                summary: string;
            } | undefined;
        };
    } | undefined;
    analytics?: {
        siteRoute404Patterns: string[];
        articlePathPattern: string;
        aiBotList: {
            match: string;
            bot: string;
            engine: string;
            purpose: "train" | "index" | "live";
        }[];
        refererChannelMap: {
            needles: string[];
            label?: string | undefined;
            drop?: boolean | undefined;
        }[];
        directLabel: string;
        assetPathPattern: string;
        botUaPattern: string;
        windowDays: number;
        maxDailySnapshots: number;
        cloudflare?: {
            zoneId?: string | undefined;
            accountId?: string | undefined;
            endpoint?: string | undefined;
        } | undefined;
    } | undefined;
    entityPresence?: {
        sources: {
            id: string;
            label: string;
            weight: number;
            hostNeedles: string[];
            napConsistencyChecked?: boolean | undefined;
        }[];
        engineAffinities: {
            engine: string;
            affinity: Record<string, number>;
            note?: string | undefined;
        }[];
        consistencyTargets?: {
            nap: Record<string, string>;
            name?: string | undefined;
        } | undefined;
        establishedThreshold?: number | undefined;
    } | undefined;
    compliance?: {
        pack: string;
        reviewResponseRules?: string[] | undefined;
        requireHumanReviewTags?: string[] | undefined;
    } | undefined;
}, {
    brand: {
        name: string;
        siteUrl: string;
        logoUrl?: string | undefined;
        nap?: {
            placeId?: string | undefined;
            address?: string | undefined;
            city?: string | undefined;
            region?: string | undefined;
            postalCode?: string | undefined;
            phone?: string | undefined;
        } | undefined;
        tagline?: string | undefined;
        geoFraming?: string | undefined;
        brandColors?: Record<string, string> | undefined;
    };
    authors: {
        name: string;
        slug: string;
        schemaId: string;
        profile: {
            name: string;
            url?: string | undefined;
            sameAs?: string[] | undefined;
            extra?: Record<string, unknown> | undefined;
            jobTitle?: string | undefined;
            image?: string | undefined;
            knowsAbout?: string[] | undefined;
            credential?: string | undefined;
            alumniOf?: string[] | undefined;
            memberOf?: string[] | undefined;
            awards?: string[] | undefined;
        };
        title?: string | undefined;
        isPrimary?: boolean | undefined;
    }[];
    voice: {
        persona: string;
        bannedTopics: string[];
        bannedPhrasings: string[];
        rules: string[];
        voiceAnchorUrls: string[];
        readingGradeBand: [number, number];
    };
    content: {
        categories: string[];
        categoryTargets: Record<string, number>;
        defaultAuthorSlug: string;
        timezone: string;
        lifecycle?: {
            docReviewed?: boolean | undefined;
        } | undefined;
    };
    scoring: {
        seo: {
            title: {
                good: [number, number];
                mehMax: number;
            };
            excerpt: {
                good: [number, number];
                meh: [number, number];
            };
            slugMaxLen: number;
            wordCount: {
                good: [number, number];
                mehMin: number;
            };
            bodyChars: {
                good: number;
                meh: number;
            };
            h2: {
                good: [number, number];
                meh: [number, number];
            };
            internalLinks: {
                good: number;
                meh: number;
            };
            tags: {
                good: [number, number];
                mehMin: number;
            };
            heroAltWords: {
                good: [number, number];
            };
            reading: {
                good: [number, number];
                mehMax: number;
            };
            internalLinkPrefixes: string[];
            referenceSectionNames: string[];
            evidenceTriggers: string[];
            badFilenameRe: string;
        };
        geo: {
            floor: number;
            checks: {
                id: string;
                label: string;
                weight: number;
                kind: "regexCount" | "regexPer1k" | "questionH2";
                thresholds: [number, number];
                patterns?: string[] | undefined;
                flags?: string | undefined;
                target?: "cleaned" | "body" | undefined;
            }[];
        };
    };
    citation: {
        policy: "direct-source-urls" | "search-urls-only" | "verifier-required";
        forbiddenPatterns: string[];
        referenceFormat: string;
        verifier: {
            kind: "none" | "cite8" | "primary-source";
            baseUrl?: string | undefined;
        };
    };
    aeo: {
        brandMentions: string[];
        querySet: {
            id: string;
            tags: string[];
            query: string;
        }[];
        engines: ("perplexity" | "anthropic" | "google-aio" | "openai")[];
        highPriorityTags: string[];
        localSearchLocation?: string | undefined;
        maxSnapshots?: number | undefined;
    };
    schema: {
        orgType: string[];
        org: {
            name: string;
            url: string;
            logoUrl?: string | undefined;
            sameAs?: string[] | undefined;
            extra?: Record<string, unknown> | undefined;
        };
        articleTypes: string[];
        publishingPrinciplesUrl?: string | undefined;
        articleGraph?: {
            publishingPrinciplesUrl?: string | undefined;
            reviewerSchemaId?: string | undefined;
            emitLastReviewed?: boolean | undefined;
            heroImageDimensions?: {
                width: number;
                height: number;
            } | undefined;
            sourceEpisodeSeriesName?: string | undefined;
        } | undefined;
        emitLlmsTxt?: boolean | undefined;
        llmsTxt?: {
            summary?: string | undefined;
            intro?: string | undefined;
            sections?: {
                heading: string;
                items: (string | {
                    label: string;
                    url?: string | undefined;
                    note?: string | undefined;
                })[];
            }[] | undefined;
        } | undefined;
    };
    capabilities: {
        drafting?: boolean | undefined;
        amplify?: boolean | undefined;
        entityPresence?: boolean | undefined;
        audio?: boolean | undefined;
        heroImages?: boolean | undefined;
        competitiveIntel?: boolean | undefined;
        engagementAnalytics?: boolean | undefined;
    };
    services: {
        store: "github" | "fs";
        requiredEnv: string[];
        analytics?: "none" | "cloudflare" | undefined;
        contentDir?: string | undefined;
    };
    competitors?: {
        roster: {
            name: string;
            url: string;
            id: string;
            placeId?: string | undefined;
            targetKeywords?: string[] | undefined;
        }[];
        targetKeywords: string[];
        ourPlaceId?: string | undefined;
        ourName?: string | undefined;
        localPackLocation?: string | undefined;
        highValuePatterns?: string[] | undefined;
        skipPatterns?: string[] | undefined;
        templateVendors?: {
            name: string;
            fingerprints: string[];
        }[] | undefined;
    } | undefined;
    strategy?: {
        thresholds: {
            real404MinRequests: number;
            real404HighRequests: number;
            serverError5xxMin: number;
            serverError5xxHigh: number;
            topContentPaths: number;
            geoHighTopRank: number;
            geoTargetMargin: number;
            audioTopRank: number;
            socialMinReferrers: number;
            socialGapFraction: number;
            socialGapFloor: number;
            climbRankRange: [number, number];
            climbMax: number;
            maxRecommendations: number;
        };
        siteRoute404Patterns: string[];
        articlePathPattern: string;
        refererGroups: {
            social: string[];
            search: string[];
        };
        liveCrawlPurpose: string;
        deepLinks: Record<string, {
            link: string;
            linkLabel?: string | undefined;
        }>;
        copy: Record<string, {
            title: string;
            evidence: string;
        }>;
    } | undefined;
    drafting?: {
        models: Record<string, string>;
        defaultModel: string;
        utilityModel: string;
        draftFloor: {
            seo: number;
            geo: number;
        };
        wordCountTarget: [number, number];
        bodyCharCeiling: number;
        maxTokens: {
            brainstorm: number;
            draft: number;
            outline: number;
            'draft-series': number;
            'draft-series-article': number;
            fixPass: number;
            extractClaims: number;
            chat: number;
        };
        promptOverrides?: Record<string, string> | undefined;
    } | undefined;
    amplify?: {
        channels: {
            id: string;
            label: string;
            guidance: string;
            fieldDescription: string;
            utm?: string | undefined;
            noUrl?: boolean | undefined;
        }[];
        systemPreamble: string;
        carouselSchemes: {
            id: string;
            label: string;
            bg: string;
            fg: string;
            accent: string;
        }[];
        carouselGuidance: string;
        newsletterGuidance: string;
        carouselStateDir?: string | undefined;
    } | undefined;
    media?: {
        narration: {
            referenceSectionNames: string[];
            voiceId: string;
            model: string;
            voiceSettings: {
                stability: number;
                similarity_boost: number;
                style: number;
                use_speaker_boost: boolean;
            };
            outroText: string;
            pronunciationOverrides: {
                word: string;
                ipa: string;
            }[];
            abbreviationExpansions: {
                abbr: string;
                full: string;
            }[];
            chunkChars: number;
            maxChars: number;
        };
        heroImage: {
            model: string;
            size: string;
            quality: string;
            promptTemplate: string;
            proposalSystem: string;
        };
        podcast: {
            title: string;
            subtitle: string;
            description: string;
            author: string;
            ownerEmail: string;
            category: string;
            coverImage: string;
            subcategory?: string | undefined;
            copyright?: string | undefined;
            language?: string | undefined;
            charsPerMinute?: number | undefined;
            trailer?: {
                title: string;
                audioPath: string;
                audioSize: number;
                duration: string;
                pubDate: string;
                summary: string;
            } | undefined;
        };
    } | undefined;
    analytics?: {
        siteRoute404Patterns: string[];
        articlePathPattern: string;
        aiBotList: {
            match: string;
            bot: string;
            engine: string;
            purpose: "train" | "index" | "live";
        }[];
        refererChannelMap: {
            needles: string[];
            label?: string | undefined;
            drop?: boolean | undefined;
        }[];
        directLabel: string;
        assetPathPattern: string;
        botUaPattern: string;
        windowDays: number;
        maxDailySnapshots: number;
        cloudflare?: {
            zoneId?: string | undefined;
            accountId?: string | undefined;
            endpoint?: string | undefined;
        } | undefined;
    } | undefined;
    entityPresence?: {
        sources: {
            id: string;
            label: string;
            weight: number;
            hostNeedles: string[];
            napConsistencyChecked?: boolean | undefined;
        }[];
        engineAffinities: {
            engine: string;
            affinity: Record<string, number>;
            note?: string | undefined;
        }[];
        consistencyTargets?: {
            nap: Record<string, string>;
            name?: string | undefined;
        } | undefined;
        establishedThreshold?: number | undefined;
    } | undefined;
    compliance?: {
        pack: string;
        reviewResponseRules?: string[] | undefined;
        requireHumanReviewTags?: string[] | undefined;
    } | undefined;
}>, {
    brand: {
        name: string;
        siteUrl: string;
        logoUrl?: string | undefined;
        nap?: {
            placeId?: string | undefined;
            address?: string | undefined;
            city?: string | undefined;
            region?: string | undefined;
            postalCode?: string | undefined;
            phone?: string | undefined;
        } | undefined;
        tagline?: string | undefined;
        geoFraming?: string | undefined;
        brandColors?: Record<string, string> | undefined;
    };
    authors: {
        name: string;
        slug: string;
        schemaId: string;
        profile: {
            name: string;
            url?: string | undefined;
            sameAs?: string[] | undefined;
            extra?: Record<string, unknown> | undefined;
            jobTitle?: string | undefined;
            image?: string | undefined;
            knowsAbout?: string[] | undefined;
            credential?: string | undefined;
            alumniOf?: string[] | undefined;
            memberOf?: string[] | undefined;
            awards?: string[] | undefined;
        };
        title?: string | undefined;
        isPrimary?: boolean | undefined;
    }[];
    voice: {
        persona: string;
        bannedTopics: string[];
        bannedPhrasings: string[];
        rules: string[];
        voiceAnchorUrls: string[];
        readingGradeBand: [number, number];
    };
    content: {
        categories: string[];
        categoryTargets: Record<string, number>;
        defaultAuthorSlug: string;
        timezone: string;
        lifecycle?: {
            docReviewed?: boolean | undefined;
        } | undefined;
    };
    scoring: {
        seo: {
            title: {
                good: [number, number];
                mehMax: number;
            };
            excerpt: {
                good: [number, number];
                meh: [number, number];
            };
            slugMaxLen: number;
            wordCount: {
                good: [number, number];
                mehMin: number;
            };
            bodyChars: {
                good: number;
                meh: number;
            };
            h2: {
                good: [number, number];
                meh: [number, number];
            };
            internalLinks: {
                good: number;
                meh: number;
            };
            tags: {
                good: [number, number];
                mehMin: number;
            };
            heroAltWords: {
                good: [number, number];
            };
            reading: {
                good: [number, number];
                mehMax: number;
            };
            internalLinkPrefixes: string[];
            referenceSectionNames: string[];
            evidenceTriggers: string[];
            badFilenameRe: string;
        };
        geo: {
            floor: number;
            checks: {
                id: string;
                label: string;
                weight: number;
                kind: "regexCount" | "regexPer1k" | "questionH2";
                thresholds: [number, number];
                patterns?: string[] | undefined;
                flags?: string | undefined;
                target?: "cleaned" | "body" | undefined;
            }[];
        };
    };
    citation: {
        policy: "direct-source-urls" | "search-urls-only" | "verifier-required";
        forbiddenPatterns: string[];
        referenceFormat: string;
        verifier: {
            kind: "none" | "cite8" | "primary-source";
            baseUrl?: string | undefined;
        };
    };
    aeo: {
        brandMentions: string[];
        querySet: {
            id: string;
            tags: string[];
            query: string;
        }[];
        engines: ("perplexity" | "anthropic" | "google-aio" | "openai")[];
        highPriorityTags: string[];
        localSearchLocation?: string | undefined;
        maxSnapshots?: number | undefined;
    };
    schema: {
        orgType: string[];
        org: {
            name: string;
            url: string;
            logoUrl?: string | undefined;
            sameAs?: string[] | undefined;
            extra?: Record<string, unknown> | undefined;
        };
        articleTypes: string[];
        publishingPrinciplesUrl?: string | undefined;
        articleGraph?: {
            publishingPrinciplesUrl?: string | undefined;
            reviewerSchemaId?: string | undefined;
            emitLastReviewed?: boolean | undefined;
            heroImageDimensions?: {
                width: number;
                height: number;
            } | undefined;
            sourceEpisodeSeriesName?: string | undefined;
        } | undefined;
        emitLlmsTxt?: boolean | undefined;
        llmsTxt?: {
            summary?: string | undefined;
            intro?: string | undefined;
            sections?: {
                heading: string;
                items: (string | {
                    label: string;
                    url?: string | undefined;
                    note?: string | undefined;
                })[];
            }[] | undefined;
        } | undefined;
    };
    capabilities: {
        drafting?: boolean | undefined;
        amplify?: boolean | undefined;
        entityPresence?: boolean | undefined;
        audio?: boolean | undefined;
        heroImages?: boolean | undefined;
        competitiveIntel?: boolean | undefined;
        engagementAnalytics?: boolean | undefined;
    };
    services: {
        store: "github" | "fs";
        requiredEnv: string[];
        analytics?: "none" | "cloudflare" | undefined;
        contentDir?: string | undefined;
    };
    competitors?: {
        roster: {
            name: string;
            url: string;
            id: string;
            placeId?: string | undefined;
            targetKeywords?: string[] | undefined;
        }[];
        targetKeywords: string[];
        ourPlaceId?: string | undefined;
        ourName?: string | undefined;
        localPackLocation?: string | undefined;
        highValuePatterns?: string[] | undefined;
        skipPatterns?: string[] | undefined;
        templateVendors?: {
            name: string;
            fingerprints: string[];
        }[] | undefined;
    } | undefined;
    strategy?: {
        thresholds: {
            real404MinRequests: number;
            real404HighRequests: number;
            serverError5xxMin: number;
            serverError5xxHigh: number;
            topContentPaths: number;
            geoHighTopRank: number;
            geoTargetMargin: number;
            audioTopRank: number;
            socialMinReferrers: number;
            socialGapFraction: number;
            socialGapFloor: number;
            climbRankRange: [number, number];
            climbMax: number;
            maxRecommendations: number;
        };
        siteRoute404Patterns: string[];
        articlePathPattern: string;
        refererGroups: {
            social: string[];
            search: string[];
        };
        liveCrawlPurpose: string;
        deepLinks: Record<string, {
            link: string;
            linkLabel?: string | undefined;
        }>;
        copy: Record<string, {
            title: string;
            evidence: string;
        }>;
    } | undefined;
    drafting?: {
        models: Record<string, string>;
        defaultModel: string;
        utilityModel: string;
        draftFloor: {
            seo: number;
            geo: number;
        };
        wordCountTarget: [number, number];
        bodyCharCeiling: number;
        maxTokens: {
            brainstorm: number;
            draft: number;
            outline: number;
            'draft-series': number;
            'draft-series-article': number;
            fixPass: number;
            extractClaims: number;
            chat: number;
        };
        promptOverrides?: Record<string, string> | undefined;
    } | undefined;
    amplify?: {
        channels: {
            id: string;
            label: string;
            guidance: string;
            fieldDescription: string;
            utm?: string | undefined;
            noUrl?: boolean | undefined;
        }[];
        systemPreamble: string;
        carouselSchemes: {
            id: string;
            label: string;
            bg: string;
            fg: string;
            accent: string;
        }[];
        carouselGuidance: string;
        newsletterGuidance: string;
        carouselStateDir?: string | undefined;
    } | undefined;
    media?: {
        narration: {
            referenceSectionNames: string[];
            voiceId: string;
            model: string;
            voiceSettings: {
                stability: number;
                similarity_boost: number;
                style: number;
                use_speaker_boost: boolean;
            };
            outroText: string;
            pronunciationOverrides: {
                word: string;
                ipa: string;
            }[];
            abbreviationExpansions: {
                abbr: string;
                full: string;
            }[];
            chunkChars: number;
            maxChars: number;
        };
        heroImage: {
            model: string;
            size: string;
            quality: string;
            promptTemplate: string;
            proposalSystem: string;
        };
        podcast: {
            title: string;
            subtitle: string;
            description: string;
            author: string;
            ownerEmail: string;
            category: string;
            coverImage: string;
            subcategory?: string | undefined;
            copyright?: string | undefined;
            language?: string | undefined;
            charsPerMinute?: number | undefined;
            trailer?: {
                title: string;
                audioPath: string;
                audioSize: number;
                duration: string;
                pubDate: string;
                summary: string;
            } | undefined;
        };
    } | undefined;
    analytics?: {
        siteRoute404Patterns: string[];
        articlePathPattern: string;
        aiBotList: {
            match: string;
            bot: string;
            engine: string;
            purpose: "train" | "index" | "live";
        }[];
        refererChannelMap: {
            needles: string[];
            label?: string | undefined;
            drop?: boolean | undefined;
        }[];
        directLabel: string;
        assetPathPattern: string;
        botUaPattern: string;
        windowDays: number;
        maxDailySnapshots: number;
        cloudflare?: {
            zoneId?: string | undefined;
            accountId?: string | undefined;
            endpoint?: string | undefined;
        } | undefined;
    } | undefined;
    entityPresence?: {
        sources: {
            id: string;
            label: string;
            weight: number;
            hostNeedles: string[];
            napConsistencyChecked?: boolean | undefined;
        }[];
        engineAffinities: {
            engine: string;
            affinity: Record<string, number>;
            note?: string | undefined;
        }[];
        consistencyTargets?: {
            nap: Record<string, string>;
            name?: string | undefined;
        } | undefined;
        establishedThreshold?: number | undefined;
    } | undefined;
    compliance?: {
        pack: string;
        reviewResponseRules?: string[] | undefined;
        requireHumanReviewTags?: string[] | undefined;
    } | undefined;
}, {
    brand: {
        name: string;
        siteUrl: string;
        logoUrl?: string | undefined;
        nap?: {
            placeId?: string | undefined;
            address?: string | undefined;
            city?: string | undefined;
            region?: string | undefined;
            postalCode?: string | undefined;
            phone?: string | undefined;
        } | undefined;
        tagline?: string | undefined;
        geoFraming?: string | undefined;
        brandColors?: Record<string, string> | undefined;
    };
    authors: {
        name: string;
        slug: string;
        schemaId: string;
        profile: {
            name: string;
            url?: string | undefined;
            sameAs?: string[] | undefined;
            extra?: Record<string, unknown> | undefined;
            jobTitle?: string | undefined;
            image?: string | undefined;
            knowsAbout?: string[] | undefined;
            credential?: string | undefined;
            alumniOf?: string[] | undefined;
            memberOf?: string[] | undefined;
            awards?: string[] | undefined;
        };
        title?: string | undefined;
        isPrimary?: boolean | undefined;
    }[];
    voice: {
        persona: string;
        bannedTopics: string[];
        bannedPhrasings: string[];
        rules: string[];
        voiceAnchorUrls: string[];
        readingGradeBand: [number, number];
    };
    content: {
        categories: string[];
        categoryTargets: Record<string, number>;
        defaultAuthorSlug: string;
        timezone: string;
        lifecycle?: {
            docReviewed?: boolean | undefined;
        } | undefined;
    };
    scoring: {
        seo: {
            title: {
                good: [number, number];
                mehMax: number;
            };
            excerpt: {
                good: [number, number];
                meh: [number, number];
            };
            slugMaxLen: number;
            wordCount: {
                good: [number, number];
                mehMin: number;
            };
            bodyChars: {
                good: number;
                meh: number;
            };
            h2: {
                good: [number, number];
                meh: [number, number];
            };
            internalLinks: {
                good: number;
                meh: number;
            };
            tags: {
                good: [number, number];
                mehMin: number;
            };
            heroAltWords: {
                good: [number, number];
            };
            reading: {
                good: [number, number];
                mehMax: number;
            };
            internalLinkPrefixes: string[];
            referenceSectionNames: string[];
            evidenceTriggers: string[];
            badFilenameRe: string;
        };
        geo: {
            floor: number;
            checks: {
                id: string;
                label: string;
                weight: number;
                kind: "regexCount" | "regexPer1k" | "questionH2";
                thresholds: [number, number];
                patterns?: string[] | undefined;
                flags?: string | undefined;
                target?: "cleaned" | "body" | undefined;
            }[];
        };
    };
    citation: {
        policy: "direct-source-urls" | "search-urls-only" | "verifier-required";
        forbiddenPatterns: string[];
        referenceFormat: string;
        verifier: {
            kind: "none" | "cite8" | "primary-source";
            baseUrl?: string | undefined;
        };
    };
    aeo: {
        brandMentions: string[];
        querySet: {
            id: string;
            tags: string[];
            query: string;
        }[];
        engines: ("perplexity" | "anthropic" | "google-aio" | "openai")[];
        highPriorityTags: string[];
        localSearchLocation?: string | undefined;
        maxSnapshots?: number | undefined;
    };
    schema: {
        orgType: string[];
        org: {
            name: string;
            url: string;
            logoUrl?: string | undefined;
            sameAs?: string[] | undefined;
            extra?: Record<string, unknown> | undefined;
        };
        articleTypes: string[];
        publishingPrinciplesUrl?: string | undefined;
        articleGraph?: {
            publishingPrinciplesUrl?: string | undefined;
            reviewerSchemaId?: string | undefined;
            emitLastReviewed?: boolean | undefined;
            heroImageDimensions?: {
                width: number;
                height: number;
            } | undefined;
            sourceEpisodeSeriesName?: string | undefined;
        } | undefined;
        emitLlmsTxt?: boolean | undefined;
        llmsTxt?: {
            summary?: string | undefined;
            intro?: string | undefined;
            sections?: {
                heading: string;
                items: (string | {
                    label: string;
                    url?: string | undefined;
                    note?: string | undefined;
                })[];
            }[] | undefined;
        } | undefined;
    };
    capabilities: {
        drafting?: boolean | undefined;
        amplify?: boolean | undefined;
        entityPresence?: boolean | undefined;
        audio?: boolean | undefined;
        heroImages?: boolean | undefined;
        competitiveIntel?: boolean | undefined;
        engagementAnalytics?: boolean | undefined;
    };
    services: {
        store: "github" | "fs";
        requiredEnv: string[];
        analytics?: "none" | "cloudflare" | undefined;
        contentDir?: string | undefined;
    };
    competitors?: {
        roster: {
            name: string;
            url: string;
            id: string;
            placeId?: string | undefined;
            targetKeywords?: string[] | undefined;
        }[];
        targetKeywords: string[];
        ourPlaceId?: string | undefined;
        ourName?: string | undefined;
        localPackLocation?: string | undefined;
        highValuePatterns?: string[] | undefined;
        skipPatterns?: string[] | undefined;
        templateVendors?: {
            name: string;
            fingerprints: string[];
        }[] | undefined;
    } | undefined;
    strategy?: {
        thresholds: {
            real404MinRequests: number;
            real404HighRequests: number;
            serverError5xxMin: number;
            serverError5xxHigh: number;
            topContentPaths: number;
            geoHighTopRank: number;
            geoTargetMargin: number;
            audioTopRank: number;
            socialMinReferrers: number;
            socialGapFraction: number;
            socialGapFloor: number;
            climbRankRange: [number, number];
            climbMax: number;
            maxRecommendations: number;
        };
        siteRoute404Patterns: string[];
        articlePathPattern: string;
        refererGroups: {
            social: string[];
            search: string[];
        };
        liveCrawlPurpose: string;
        deepLinks: Record<string, {
            link: string;
            linkLabel?: string | undefined;
        }>;
        copy: Record<string, {
            title: string;
            evidence: string;
        }>;
    } | undefined;
    drafting?: {
        models: Record<string, string>;
        defaultModel: string;
        utilityModel: string;
        draftFloor: {
            seo: number;
            geo: number;
        };
        wordCountTarget: [number, number];
        bodyCharCeiling: number;
        maxTokens: {
            brainstorm: number;
            draft: number;
            outline: number;
            'draft-series': number;
            'draft-series-article': number;
            fixPass: number;
            extractClaims: number;
            chat: number;
        };
        promptOverrides?: Record<string, string> | undefined;
    } | undefined;
    amplify?: {
        channels: {
            id: string;
            label: string;
            guidance: string;
            fieldDescription: string;
            utm?: string | undefined;
            noUrl?: boolean | undefined;
        }[];
        systemPreamble: string;
        carouselSchemes: {
            id: string;
            label: string;
            bg: string;
            fg: string;
            accent: string;
        }[];
        carouselGuidance: string;
        newsletterGuidance: string;
        carouselStateDir?: string | undefined;
    } | undefined;
    media?: {
        narration: {
            referenceSectionNames: string[];
            voiceId: string;
            model: string;
            voiceSettings: {
                stability: number;
                similarity_boost: number;
                style: number;
                use_speaker_boost: boolean;
            };
            outroText: string;
            pronunciationOverrides: {
                word: string;
                ipa: string;
            }[];
            abbreviationExpansions: {
                abbr: string;
                full: string;
            }[];
            chunkChars: number;
            maxChars: number;
        };
        heroImage: {
            model: string;
            size: string;
            quality: string;
            promptTemplate: string;
            proposalSystem: string;
        };
        podcast: {
            title: string;
            subtitle: string;
            description: string;
            author: string;
            ownerEmail: string;
            category: string;
            coverImage: string;
            subcategory?: string | undefined;
            copyright?: string | undefined;
            language?: string | undefined;
            charsPerMinute?: number | undefined;
            trailer?: {
                title: string;
                audioPath: string;
                audioSize: number;
                duration: string;
                pubDate: string;
                summary: string;
            } | undefined;
        };
    } | undefined;
    analytics?: {
        siteRoute404Patterns: string[];
        articlePathPattern: string;
        aiBotList: {
            match: string;
            bot: string;
            engine: string;
            purpose: "train" | "index" | "live";
        }[];
        refererChannelMap: {
            needles: string[];
            label?: string | undefined;
            drop?: boolean | undefined;
        }[];
        directLabel: string;
        assetPathPattern: string;
        botUaPattern: string;
        windowDays: number;
        maxDailySnapshots: number;
        cloudflare?: {
            zoneId?: string | undefined;
            accountId?: string | undefined;
            endpoint?: string | undefined;
        } | undefined;
    } | undefined;
    entityPresence?: {
        sources: {
            id: string;
            label: string;
            weight: number;
            hostNeedles: string[];
            napConsistencyChecked?: boolean | undefined;
        }[];
        engineAffinities: {
            engine: string;
            affinity: Record<string, number>;
            note?: string | undefined;
        }[];
        consistencyTargets?: {
            nap: Record<string, string>;
            name?: string | undefined;
        } | undefined;
        establishedThreshold?: number | undefined;
    } | undefined;
    compliance?: {
        pack: string;
        reviewResponseRules?: string[] | undefined;
        requireHumanReviewTags?: string[] | undefined;
    } | undefined;
}>;
type DomainPackInput = z.input<typeof domainPackSchema>;

/**
 * Canonical scoring defaults, ported verbatim from the source system
 * (Body of Health `src/lib/admin/seo.ts`). A new project gets identical
 * scoring behavior unless it overrides these — but every value here is a knob,
 * not a constant. The Princeton GEO findings the weights encode are
 * domain-general; the detection patterns are the part a non-health domain
 * overrides (see the Northwatch example).
 */
declare const defaultGeoConfig: GeoConfig;
declare const defaultSeoConfig: SeoConfig;
declare const defaultScoringConfig: ScoringConfig;
/**
 * Strategy-engine defaults, ported verbatim from Body of Health
 * `src/lib/admin/strategy.ts` (the thresholds, the SITE_ROUTE_404 regexes, the
 * referer needle groups, the deep-links and the evidence/title copy). Every
 * value here is a knob: a non-content domain re-points `siteRoute404Patterns`
 * at its own routes, re-voices `copy`, and re-targets `deepLinks` without
 * touching engine code. `{token}` placeholders in copy are filled by the rule.
 */
declare const defaultStrategyConfig: StrategyConfig;
/**
 * Drafting + editor-chat defaults, ported from Body of Health `author.ts` /
 * `chat.ts` (the MODELS map, the 70/70 draft floor, the 800–1500 word target,
 * the 10 000-char TTS ceiling, the per-mode max_tokens). Every value is a knob;
 * @jeldon/drafting falls back to this when `pack.drafting` is omitted. The model
 * ids match BoH's aliases — a domain on a different provider re-points them.
 */
declare const defaultDraftingConfig: DraftingConfig;
/**
 * Amplification defaults, ported verbatim from Body of Health
 * `src/pages/api/admin/amplify/[slug].ts` (channels, UTM map, tool-field
 * descriptions) + `carousel/[slug].ts` (COLOR_SCHEMES + the carousel craft
 * prompt) + `newsletter-content.ts` (the newsletter shape).
 *
 * Per docs/DECOUPLING-NOTES.md "Voice block duplicated ×4": the voice rules are
 * NOT here — they live once in `pack.voice` and `buildKitSystem()` injects them.
 * What's here is the *channel craft*, which is the same regardless of voice.
 * Every label/guidance/UTM is a knob a non-clinic domain re-points.
 */
declare const defaultAmplifyConfig: AmplifyConfig;
/**
 * Media defaults, ported verbatim from Body of Health `src/lib/admin/narration.ts`
 * (voice settings, outro, IPA + abbreviation tables, chunk/cap thresholds),
 * `src/pages/api/admin/audio/[slug].ts` (the voice id + model + safety caps),
 * `src/pages/api/admin/image-prompt/[slug].ts` (the locked sketchbook prompt
 * template + art-director system prompt), and `src/pages/podcast.xml.ts`
 * (the show metadata + trailer). Every value is a knob; @jeldon/media falls
 * back to this when `pack.media` is omitted. The brand-specific strings (outro,
 * Corvallis/Willamette IPA, sketchbook palette, podcast description) are the
 * BoH default — a non-clinic domain re-points them via `pack.media`.
 */
declare const defaultMediaConfig: MediaConfig;
/**
 * Off-site entity-presence defaults (@jeldon/entity-presence). NEW module — not
 * ported from the source system; designed from docs/AEO-PLAYBOOK.md §"The
 * biggest lever the source system doesn't have yet". The source set + per-engine
 * affinities encode the documented finding that off-site mentions correlate
 * ~3× stronger with AI visibility than backlinks, and differ per engine
 * (Reddit → Perplexity, Wikipedia/consensus → ChatGPT, structured depth →
 * Claude). Every value is a knob: a non-clinic domain re-points `hostNeedles`,
 * re-weights sources, and re-tunes `engineAffinities` without touching engine
 * code. @jeldon/entity-presence falls back to this when `pack.entityPresence`
 * is omitted.
 */
declare const defaultEntityPresenceConfig: EntityPresenceConfig;
/**
 * Crawler + edge-analytics defaults, ported verbatim from Body of Health.
 *
 * - `aiBotList` is the UNION of the two source lists (`src/lib/admin/ai-crawlers.ts`
 *   regex table + `scripts/fetch-cf-analytics.mjs` AI_BOTS substring table) — the
 *   cron list was the superset, so it's the base; ordered most-specific-token
 *   first so e.g. "Claude-SearchBot" isn't shadowed by "ClaudeBot". This single
 *   injected list is what kills the 2-file duplication.
 * - `refererChannelMap` consolidates the THREE referer/source classifiers
 *   (`fetch-cf-analytics.mjs::classifyReferer`, `traffic-sources.ts::classifySource`,
 *   the editor CTA logic). Rules are evaluated in order; first match wins. `drop`
 *   rules (internal nav, the CF Access auth redirect) suppress the source. The
 *   own-domain `yourbodyofhealth.com` needle is the one truly brand-specific
 *   value — a new domain re-points it.
 * - The CF zone/account ids that were env-literals in BoH (`CF_ZONE_ID` /
 *   `CF_ACCOUNT_ID`) are config here; the secret token stays in env.
 *
 * Every value is a knob; @jeldon/crawler-analytics falls back to this when
 * `pack.analytics` is omitted.
 */
declare const defaultAnalyticsConfig: AnalyticsConfig;

interface ValidateResult {
    ok: boolean;
    data?: DomainPack;
    errors: Array<{
        path: string;
        message: string;
    }>;
}
/** Validate a plain object against the Domain Pack schema. Pure — no I/O. */
declare function validateDomainPack(input: unknown): ValidateResult;
declare function resolveConfigPath(cwd?: string, explicit?: string): string | null;
/**
 * Load + validate the project's Domain Pack. Imports `jeldon.config.ts` via
 * jiti (no build step required), reads its default export, and validates.
 * Throws with a readable message on any failure.
 */
declare function loadDomainPack(opts?: {
    cwd?: string;
    path?: string;
}): Promise<DomainPack>;
/** Identity helper for type-safe config authoring in `jeldon.config.ts`. */
declare function defineDomainPack(pack: DomainPack): DomainPack;

export { type AbbreviationExpansion, type AeoConfig, type AeoQuery, type AiBot, type AmplifyChannel, type AmplifyConfig, type AnalyticsConfig, type ArticleSchemaPolicy, type CarouselScheme, type CitationConfig, type CompetitorEntry, type CompetitorsConfig, type DomainPack, type DomainPackInput, type DraftingConfig, type EnginePresenceAffinity, type EntityPresenceConfig, type EntityPresenceSource, type GeoCheckDef, type GeoConfig, type HeroImageConfig, type LlmsTxtConfig, type LlmsTxtSection, type MediaConfig, type MentionConsistencyTargets, type NarrationConfig, type OrgProfile, type PersonProfile, type PodcastConfig, type PodcastTrailer, type PronunciationOverride, type RefererChannelRule, type ScoringConfig, type SeoConfig, type StrategyConfig, type StrategyRefererGroups, type StrategyThresholds, type ValidateResult, type VoiceSettings, defaultAmplifyConfig, defaultAnalyticsConfig, defaultDraftingConfig, defaultEntityPresenceConfig, defaultGeoConfig, defaultMediaConfig, defaultScoringConfig, defaultSeoConfig, defaultStrategyConfig, defineDomainPack, domainPackSchema, loadDomainPack, resolveConfigPath, validateDomainPack };
