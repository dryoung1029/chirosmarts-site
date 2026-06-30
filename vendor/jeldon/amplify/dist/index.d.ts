import { DomainPack } from '@jeldon/config';
import { Store } from '@jeldon/store';

/**
 * The SINGLE voice read for every amplify prompt.
 *
 * Per docs/DECOUPLING-NOTES.md "Voice block duplicated ×4": BoH inlined the same
 * voice paragraph into `amplify/[slug].ts`, `carousel/[slug].ts`, and
 * `newsletter-content.ts` (and `auto-newsletter.mjs` mirrored it again). Here it
 * is built once from `pack.voice` and prepended to whatever channel/carousel/
 * newsletter craft prompt the caller assembles. Change the voice in the pack and
 * all three surfaces move together — no hand-copied paragraph to drift.
 */
declare function buildVoiceBlock(pack: Pick<DomainPack, 'voice' | 'brand'>): string;

/**
 * @jeldon/amplify types.
 *
 * The article shape the kit reads is intentionally narrow — slug + the
 * frontmatter/body fields the BoH amplify/carousel/newsletter endpoints
 * actually used. A host adapts its own article record to this.
 */
/** The minimal article view the amplify kit needs. Maps 1:1 to the fields the
 *  BoH endpoints read off `parse(file.content)`. */
interface AmplifyArticle {
    slug: string;
    title: string;
    excerpt?: string;
    category?: string;
    tags?: string[];
    /** Full article body markdown (without frontmatter). */
    body: string;
    heroImage?: string;
    heroImageAlt?: string;
    readTime?: string;
    /** True while the article is still a draft — the kit notes the URL will 404. */
    isDraft?: boolean;
}
/** One channel's produced copy, keyed by channel id. */
type AmplifyKit = Record<string, string>;
interface GenerateKitResult {
    /** Per-channel copy keyed by `AmplifyChannel.id`. URLs are UTM-tagged. */
    kit: AmplifyKit;
    meta: {
        url: string;
        title: string;
        isDraft: boolean;
    };
    model: string;
    usage?: LlmUsage;
}
interface RegenerateChannelResult {
    channel: string;
    text: string;
    meta: {
        url: string;
        title: string;
        isDraft: boolean;
    };
    model: string;
    usage?: LlmUsage;
}
/** One carousel text slide as the model returns it. */
interface CarouselSlide {
    kicker?: string;
    body: string;
    footer?: string;
}
interface GenerateCarouselResult {
    schemeId: string;
    scheme: {
        id: string;
        label: string;
        bg: string;
        fg: string;
        accent: string;
    };
    schemes: Array<{
        id: string;
        label: string;
        bg: string;
        fg: string;
        accent: string;
    }>;
    slides: CarouselSlide[];
    heroImage: string | null;
    heroImageAlt: string | null;
    title: string;
    slug: string;
    articleUrl: string;
    model: string;
    usage?: LlmUsage;
}
interface NewsletterContent {
    subject: string;
    body: string;
}
interface LlmUsage {
    input_tokens: number;
    output_tokens: number;
}
/** A single tool the LLM call exposes, in Anthropic Messages tool shape. */
interface LlmTool {
    name: string;
    description: string;
    input_schema: Record<string, unknown>;
}
interface LlmToolRequest {
    model: string;
    system: string;
    userMessage: string;
    maxTokens: number;
    tool: LlmTool;
}
interface LlmToolResponse {
    /** The forced tool's `input` object, or null when the model produced none. */
    input: Record<string, unknown> | null;
    stopReason: string;
    usage?: LlmUsage;
}
/**
 * The single I/O boundary for the kit's model calls. Default adapter is
 * `AnthropicLlmClient`; tests inject a stub. Mirrors how @jeldon/aeo-audit
 * keeps every fetch behind an `EngineFn` so the logic is host-free.
 */
interface LlmClient {
    /** Run a single forced-tool-use call and return the tool input. */
    callTool(req: LlmToolRequest): Promise<LlmToolResponse>;
}

/** Build the kit system prompt: preamble + the single voice block + every
 *  channel's guidance, in pack order. */
declare function buildKitSystem(pack: Pick<DomainPack, 'voice' | 'brand' | 'amplify'>): string;
interface GenerateKitOptions {
    model?: string;
    maxTokens?: number;
}
/**
 * Generate the full amplification kit for an article.
 *
 * @param article  the article view
 * @param pack     the Domain Pack (voice + amplify channels)
 * @param llm      the model client (default: `AnthropicLlmClient`)
 */
declare function generateKit(article: AmplifyArticle, pack: Pick<DomainPack, 'voice' | 'brand' | 'amplify'>, llm: LlmClient, opts?: GenerateKitOptions): Promise<GenerateKitResult>;
interface RegenerateChannelOptions extends GenerateKitOptions {
    /** A user refinement instruction for the new version. */
    refinement?: string;
    /** The current text — used so the model varies the angle. */
    currentText?: string;
}
/** Regenerate a single channel's copy. Ported from the `isSingleChannel` path. */
declare function regenerateChannel(article: AmplifyArticle, channelId: string, pack: Pick<DomainPack, 'voice' | 'brand' | 'amplify'>, llm: LlmClient, opts?: RegenerateChannelOptions): Promise<RegenerateChannelResult>;

interface GenerateCarouselOptions {
    model?: string;
    maxTokens?: number;
    /** Force a specific scheme id regardless of what fits. */
    schemeOverride?: string;
    /** Refinement instruction for an iteration pass. */
    refinement?: string;
    /** The current slides — present + refinement triggers iteration mode. */
    currentSlides?: CarouselSlide[];
}
/** Generate (or iterate on) a carousel for an article. */
declare function generateCarousel(article: AmplifyArticle, pack: Pick<DomainPack, 'voice' | 'brand' | 'amplify'>, llm: LlmClient, opts?: GenerateCarouselOptions): Promise<GenerateCarouselResult>;

/**
 * Carousel sidecar persistence, ported from BoH
 * `src/pages/api/admin/carousel/state/[slug].ts`. Persists per-slide *visual*
 * tweaks (BG images, opacity, typography overrides, logo toggle, seamless
 * backdrop) so they survive text regenerations and reloads. Text is NEVER
 * stored here — it's always rebuilt from the article via `generateCarousel`,
 * then the sidecar overlays by slide index at render time.
 *
 * Per the brief: persistence is via @jeldon/store (the GitHub/Fs `Store`
 * interface), not a direct GitHub coupling. The 409/422 re-fetch-and-retry
 * recovery the BoH PUT did by hand is now the Store's `saveDataFile` contract.
 */
interface SidecarSlide {
    bgImageUrl?: string;
    imagePrompt?: string;
    bgImageOpacity?: number;
    kickerSize?: number;
    bodySize?: number;
    footerSize?: number;
    showLogo?: boolean;
    logoSize?: number;
}
interface SidecarHero {
    imageUrl?: string;
    imagePrompt?: string;
    ctaSize?: number;
    brandSize?: number;
    brandText?: string;
}
interface SidecarBackdrop {
    imageUrl: string;
    imagePrompt: string;
    startIndex: number;
    endIndex: number;
}
interface CarouselSidecar {
    slides: SidecarSlide[];
    hero?: SidecarHero;
    backdrop?: SidecarBackdrop;
    updatedAt: string;
}
/**
 * Reads + writes carousel sidecars through a `Store`. The path layout
 * (`<dir>/<slug>.json`) comes from `pack.amplify.carouselStateDir`.
 */
declare class CarouselSidecarStore {
    private readonly store;
    private readonly dir;
    constructor(store: Store, pack: Pick<DomainPack, 'amplify'>);
    private path;
    /** Read the sidecar for a slug. Returns `{ state: null, sha: null }` when
     *  none exists (the article was never carousel-customized). */
    get(slug: string): Promise<{
        state: CarouselSidecar | null;
        sha: string | null;
    }>;
    /**
     * Persist a sidecar. Stamps `updatedAt`, keeps only the visual fields, and
     * relies on the Store's conflict recovery. Pass the `sha` you read for
     * optimistic concurrency; `null` resolves the current sha first (the BoH PUT
     * behaviour where a missing sha is looked up before commit).
     */
    put(slug: string, state: Pick<CarouselSidecar, 'slides' | 'hero' | 'backdrop'>, sha?: string | null): Promise<{
        sha: string;
        mergedFromConflict?: boolean;
    }>;
}

declare function buildNewsletterSystem(pack: Pick<DomainPack, 'voice' | 'brand' | 'amplify'>): string;
interface GenerateNewsletterOptions {
    model?: string;
    maxTokens?: number;
    /** Cap on article body chars passed into the prompt (BoH used 12000). */
    bodyCharLimit?: number;
}
/** Generate newsletter subject + body for an article. */
declare function generateNewsletter(article: AmplifyArticle, pack: Pick<DomainPack, 'voice' | 'brand' | 'amplify'>, llm: LlmClient, opts?: GenerateNewsletterOptions): Promise<NewsletterContent>;

/**
 * One Brevo client. Collapses the THREE BoH Brevo helpers into a single class:
 *   - `src/lib/admin/brevo-campaigns.ts` (createScheduledCampaign / cancel /
 *     sendNow / nextSendSlot)
 *   - `src/lib/admin/brevo-config.ts` (stored-JSON ⊕ env config precedence)
 *   - `scripts/auto-newsletter.mjs` (the inline re-implementation of both)
 *
 * `resolveBrevoConfig()` is the single config resolver (stored config wins,
 * env-var fallback). `BrevoClient` carries the resolved config and exposes the
 * four campaign methods. `nextSendSlot` is a pure static (timezone is a param,
 * was the hardcoded `America/Los_Angeles` literal in all three files).
 */
interface BrevoConfig {
    apiKey: string;
    listId: number;
    templateId: number;
    senderName: string;
    senderEmail: string;
    /** ISO timestamp of the last admin-UI edit; null when from env only. */
    updatedAt?: string | null;
}
/** Stored (non-secret) portion — what lives in the repo JSON / admin UI. */
interface BrevoStoredConfig {
    listId?: number;
    templateId?: number;
    senderName?: string;
    senderEmail?: string;
    updatedAt?: string | null;
}
interface CampaignParams {
    ARTICLE_TITLE: string;
    ARTICLE_EXCERPT: string;
    ARTICLE_HERO_URL: string;
    ARTICLE_BODY: string;
    ARTICLE_URL: string;
    READ_TIME: string;
}
interface ResolveBrevoConfigOptions {
    /** Non-secret config read from the repo/admin store (null/absent → env-only). */
    stored?: BrevoStoredConfig | null;
    /** Process-env-like bag (pass `process.env` or `locals.runtime.env`). */
    env: Record<string, string | undefined>;
    /** Default sender name when neither stored nor env provides one. */
    defaultSenderName?: string;
}
/**
 * Resolve the runtime Brevo config: stored value wins, env-var fallback. Throws
 * if the API key (always from env) is missing, or if list/template/sender are
 * incomplete. Ported from `brevo-config.ts::readBrevoConfig` +
 * `auto-newsletter.mjs::loadBrevoConfig` (one implementation now).
 */
declare function resolveBrevoConfig(opts: ResolveBrevoConfigOptions): BrevoConfig;
/** Just the list id — for the public newsletter-signup path that doesn't need
 *  the rest. Returns null when nothing is configured. */
declare function resolveBrevoListId(stored: BrevoStoredConfig | null | undefined, env: Record<string, string | undefined>): number | null;
declare class BrevoClient {
    private readonly config;
    constructor(config: BrevoConfig);
    /** Schedule a campaign against the configured list + template. */
    createScheduledCampaign(args: {
        name: string;
        subject: string;
        params: CampaignParams;
        scheduledAt: Date;
    }): Promise<{
        campaignId: number;
    }>;
    /**
     * Cancel a scheduled campaign. Brevo has no hard delete for a scheduled-
     * but-unsent campaign — "suspended" is the kill state.
     */
    cancel(campaignId: number): Promise<void>;
    /** Fire a campaign immediately. */
    sendNow(campaignId: number): Promise<void>;
    /**
     * Send timing: prefer the next `hour`:00 in `timezone`, with a `floorHours`
     * floor from `now` so a same-hour publish doesn't blast immediately. Pure +
     * static so it's unit-testable without a client. Ported verbatim from
     * `brevo-campaigns.ts::nextSendSlot` (timezone + hour were `America/
     * Los_Angeles` / 10 literals).
     */
    static nextSendSlot(now: Date, timezone?: string, hour?: number, floorHours?: number): Date;
}

/** Resolve a short alias to a full model id; pass through an already-full id. */
declare function resolveModel(model?: string, fallback?: string): string;
interface AnthropicLlmClientOptions {
    apiKey: string;
    /** Override the API base (proxies, gateways). */
    baseUrl?: string;
    /** anthropic-version header. */
    anthropicVersion?: string;
}
declare class AnthropicLlmClient implements LlmClient {
    private readonly apiKey;
    private readonly url;
    private readonly version;
    constructor(opts: AnthropicLlmClientOptions);
    callTool(req: LlmToolRequest): Promise<LlmToolResponse>;
}

export { type AmplifyArticle, type AmplifyKit, AnthropicLlmClient, type AnthropicLlmClientOptions, BrevoClient, type BrevoConfig, type BrevoStoredConfig, type CampaignParams, type CarouselSidecar, CarouselSidecarStore, type CarouselSlide, type GenerateCarouselOptions, type GenerateCarouselResult, type GenerateKitOptions, type GenerateKitResult, type GenerateNewsletterOptions, type LlmClient, type LlmTool, type LlmToolRequest, type LlmToolResponse, type LlmUsage, type NewsletterContent, type RegenerateChannelOptions, type RegenerateChannelResult, type ResolveBrevoConfigOptions, type SidecarBackdrop, type SidecarHero, type SidecarSlide, buildKitSystem, buildNewsletterSystem, buildVoiceBlock, generateCarousel, generateKit, generateNewsletter, regenerateChannel, resolveBrevoConfig, resolveBrevoListId, resolveModel };
