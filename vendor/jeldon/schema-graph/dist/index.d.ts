import { OrgProfile, DomainPack, PersonProfile, ArticleSchemaPolicy, LlmsTxtConfig } from '@jeldon/config';

/** A schema.org node ready for `JSON.stringify` into a
 *  `<script type="application/ld+json">` tag. Loose by construction — the
 *  graph builders compose plain objects, exactly as the BoH pages did. */
type JsonLd = Record<string, unknown>;
type Crumb = {
    name: string;
    url: string;
};
type Faq = {
    q: string;
    a: string;
};
/** The minimal article shape `articleGraph` reads. Mirrors the BoH article
 *  frontmatter the page literal consumed (`src/pages/articles/[...slug].astro`),
 *  with no Astro/content-collection coupling. */
interface ArticleInput {
    title: string;
    slug: string;
    excerpt: string;
    /** ISO 8601 or anything `new Date()` parses. */
    publishDate: string | Date;
    updatedDate?: string | Date;
    /** Article category key (one of `pack.content.categories`). */
    category: string;
    /** Human-readable section label for the category, e.g. "Evidence". */
    categoryLabel?: string;
    author: string;
    authorSlug: string;
    tags: string[];
    heroImage?: string;
    heroImageAlt?: string;
    /** URL of the source podcast episode, if any (drives `isBasedOn`). */
    sourceEpisode?: string;
}
/** An author entry as held in `pack.authors`. Re-declared structurally so the
 *  builders don't depend on the full DomainPack author tuple. */
interface AuthorEntry {
    slug: string;
    name: string;
    schemaId: string;
}
/**
 * I/O boundary for `emitLlmsTxt`. The engine never touches `fs` directly —
 * a host supplies a writer. `NullWriter` (no-op) is the default; `fsWriter`
 * is the Node convenience. Matches the DECOUPLING-NOTES rule: I/O behind an
 * interface with a null/fs default.
 */
interface Writer {
    write(path: string, contents: string): void | Promise<void>;
}

/** What `organizationGraph` needs from the pack — accepted either as a slice
 *  or as the whole DomainPack (the common call site). */
interface OrgGraphInput {
    orgType: string[];
    org: OrgProfile;
    siteUrl: string;
    /** NAP block from `pack.brand.nap`, used to build the PostalAddress node. */
    nap?: DomainPack['brand']['nap'];
    /** Optional human-readable tagline → `slogan`. */
    tagline?: string;
}
/**
 * The Organization (or MedicalBusiness/MedicalClinic, etc.) node — the
 * site-wide entity that every Article's `publisher` links to by @id.
 *
 * Ported from the inline `businessSchema` literal in BoH `BaseLayout.astro`.
 * Every BoH-specific value (`@type`, name, telephone, award, areaServed, geo,
 * hours, founder/employee, sameAs, medicalSpecialty) is now config:
 *   - `@type`          ← `pack.schema.orgType`  (generic `["Organization"]`
 *                          by default; `["MedicalBusiness","MedicalClinic"]`
 *                          for the health vertical)
 *   - name/url/logo/sameAs ← `pack.schema.org` (OrgProfile)
 *   - address          ← `pack.brand.nap`
 *   - everything else (award, areaServed, geo, hours, founder, employee,
 *     medicalSpecialty, priceRange, hasMap, …) ← `OrgProfile.extra`, merged
 *     verbatim so a vertical pack can stack arbitrary schema.org fields
 *     without an engine change.
 */
declare function organizationGraph(input: OrgGraphInput | DomainPack): JsonLd;
/**
 * The WebSite node, linked to the org by `publisher`. Ported from BoH
 * `BaseLayout.astro::websiteSchema`. SearchAction is intentionally omitted
 * (Google deprecated the sitelinks searchbox Feb 2024).
 */
declare function websiteGraph(input: OrgGraphInput | DomainPack): JsonLd;

interface PersonGraphInput {
    /** Stable schema @id every Article links to via author/reviewedBy. */
    schemaId: string;
    profile: PersonProfile;
    /** Site origin — used to link `worksFor` to the org node. */
    siteUrl: string;
    /** schema.org @type(s). Default `["Person"]`; the health vertical uses
     *  `["Person","Physician"]`. From `pack.schema` callers can pass orgType-
     *  analog; defaults keep it generic. */
    type?: string[];
}
/**
 * The author/practitioner entity node. Ported from the inline `personSchema`
 * literal on BoH `src/pages/team/jason-young.astro`.
 *
 * The contract's typed PersonProfile fields map to schema.org first-class:
 *   jobTitle, image, knowsAbout, alumniOf, memberOf, awards→award, sameAs,
 *   credential→description-adjacent. Anything richer the BoH literal carried
 *   (hasCredential, availableService, identifier, affiliation, areaServed,
 *   hasOccupation, honorificPrefix/Suffix, medicalSpecialty) rides in via
 *   `PersonProfile.extra`, merged verbatim — so the YMYL/Physician shape is a
 *   pack concern, never engine code.
 */
declare function personGraph(input: PersonGraphInput): JsonLd;

interface ArticleGraphOptions {
    /** schema.org @type(s) for the article. From `pack.schema.articleTypes`.
     *  Default `["Article"]`; YMYL packs use `["Article","MedicalWebPage"]`. */
    articleTypes?: string[];
    /** Per-domain article-graph policy (reviewer @id, review dates, etc.). */
    schemaPolicy?: ArticleSchemaPolicy;
    siteUrl: string;
}
/**
 * The Article schema node, linked to the publisher org + author entity by @id.
 *
 * Ported from the inline `articleSchema` literal in BoH
 * `src/pages/articles/[...slug].astro`. Every BoH-specific value is now config
 * or input:
 *   - `@type`               ← `pack.schema.articleTypes`
 *   - publisher @id         ← derived from `siteUrl`
 *   - author                ← matched against `authors` by `authorSlug`; a
 *                             match links by `@id` (E-E-A-T consolidation),
 *                             else an inline `Person` is emitted
 *   - reviewedBy/lastReviewed/publishingPrinciples ← `schemaPolicy`
 *     (OPT-IN; the YMYL medical-review trust graph is a pack concern, not
 *     baked into the engine)
 *   - ImageObject dimensions ← `schemaPolicy.heroImageDimensions`
 *   - isBasedOn PodcastEpisode ← present only when `article.sourceEpisode` set
 */
declare function articleGraph(article: ArticleInput, authors: AuthorEntry[], options: ArticleGraphOptions | DomainPack): JsonLd;

/**
 * Ported from Body of Health `src/lib/schema.ts::breadcrumbList`. The only
 * domain coupling — the hardcoded `SITE` constant — becomes the `siteUrl`
 * argument so relative crumb paths resolve against the project's origin.
 */
declare function breadcrumbList(crumbs: Crumb[], siteUrl: string): JsonLd;

/**
 * Extracts Q&A pairs from article markdown. Treats any H2 that ends with "?"
 * or starts with a question word as a question; the first paragraph of body
 * text that follows is the answer. Strips inline markdown formatting from the
 * answer so the JSON-LD reads as plain prose.
 *
 * Ported VERBATIM from Body of Health `src/lib/schema.ts::extractFaqs` — it is
 * fully portable (no domain literals, no I/O). The question-starter set is
 * language-general English; if a project needs another language, it can map
 * the output, but the mechanics are untouched.
 */
declare function extractFaqs(body: string): Faq[];
declare function faqPage(faqs: Faq[]): JsonLd;

/** No-op writer — the default. `emitLlmsTxt` returns the rendered string
 *  regardless; the writer only matters when a host wants the file on disk. */
declare const NullWriter: Writer;
/** Convenience Node writer. Kept lazy (dynamic import) so importing this module
 *  in a browser/edge build never pulls in `node:fs`. */
declare function fsWriter(): Writer;
/**
 * Render the llms.txt content (llmstxt.org convention) for a Domain Pack.
 *
 * Ported from BoH `public/llms.txt` (a hand-authored static file). The
 * mechanics (markdown structure: H1 brand name, summary blockquote, intro,
 * `## Section` headers with `- [label](url): note` bullets) are the engine's;
 * every domain string (the most-cited URLs, scope/policy prose, service area)
 * is config — `pack.schema.llmsTxt`. Generic by default: a pack that sets
 * `emitLlmsTxt: false` (the default) or omits `llmsTxt` renders only the H1 +
 * summary derived from `brand`.
 */
declare function renderLlmsTxt(input: {
    brandName: string;
    summary?: string;
} & LlmsTxtConfig): string;
interface EmitLlmsTxtResult {
    /** The rendered file contents (empty string when emission is disabled). */
    contents: string;
    /** Whether the pack opted into emission (`pack.schema.emitLlmsTxt`). */
    emitted: boolean;
}
/**
 * Build (and optionally write) `llms.txt` for a Domain Pack. Cheap-to-emit,
 * never a ranking pillar — gated on `pack.schema.emitLlmsTxt` (default false).
 * I/O goes through `Writer` (NullWriter default), per the DECOUPLING-NOTES rule.
 */
declare function emitLlmsTxt(pack: DomainPack, opts?: {
    writer?: Writer;
    outPath?: string;
}): Promise<EmitLlmsTxtResult>;

interface ArticleStub {
    slug: string;
    /** Stub/draft articles (ready, scheduled, or pure draft) are excluded so an
     *  indexed preview can't surface unfinished work. */
    isDraft: boolean;
}
/**
 * Build the set of `/articles/<slug>/` URLs to exclude from the sitemap.
 *
 * Ported from BoH `astro.config.mjs::sitemapExcludedArticleUrls`. The original
 * coupled three things: (1) an `fs` walk of `src/content/articles`, (2) a
 * regex frontmatter parse, (3) the hardcoded `https://yourbodyofhealth.com`
 * origin. Here only (3) is this package's concern — the origin becomes
 * `siteUrl`, and the article slug/draft list is supplied by the caller (in the
 * host, that list comes from `@jeldon/content-model`'s frontmatter codec, which
 * owns the fs walk + parse — DECOUPLING-NOTES: "one frontmatter codec; the
 * sitemap filter imports it"). This keeps the URL-building pure and testable.
 */
declare function sitemapExcludedArticleUrls(stubs: ArticleStub[], siteUrl: string): Set<string>;
/** A ready-to-use Astro `sitemap({ filter })` predicate built from the
 *  exclusion set. `page` is the absolute URL the sitemap integration passes. */
declare function sitemapFilter(excluded: Set<string>): (page: string) => boolean;

/** Join a site origin with a path-or-absolute URL. If `pathOrUrl` is already
 *  absolute (http/https), it's returned unchanged; otherwise it's appended to
 *  `siteUrl`. `siteUrl` trailing slash is normalized so we never double up. */
declare function absUrl(siteUrl: string, pathOrUrl: string): string;
/** The canonical org @id for a site (`<siteUrl>/#org`). */
declare function orgId(siteUrl: string): string;
/** The canonical website @id for a site (`<siteUrl>/#website`). */
declare function websiteId(siteUrl: string): string;

export { type ArticleGraphOptions, type ArticleInput, type ArticleStub, type AuthorEntry, type Crumb, type EmitLlmsTxtResult, type Faq, type JsonLd, NullWriter, type OrgGraphInput, type PersonGraphInput, type Writer, absUrl, articleGraph, breadcrumbList, emitLlmsTxt, extractFaqs, faqPage, fsWriter, orgId, organizationGraph, personGraph, renderLlmsTxt, sitemapExcludedArticleUrls, sitemapFilter, websiteGraph, websiteId };
