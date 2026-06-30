/**
 * JSON-LD builders. Organization / Article / FAQ / Person delegate to the shared
 * engine (@jeldon/schema-graph), specialized by jeldon.config.ts — one source of
 * truth (Constitution Rule 1). `courseLd` stays hand-built: the engine has no
 * Course builder yet (flagged for upstreaming to dryoung1029/jeldon).
 *
 * Two host-side fixes for engine assumptions (also flagged upstream):
 *  - `articleGraph` builds the canonical as /articles/<slug>/ (BoH legacy path);
 *    we point `mainEntityOfPage` at the real URL (/blog, /guides).
 *  - it doesn't emit wordCount/inLanguage — we re-add them.
 */
import { organizationGraph, articleGraph, personGraph, faqPage } from "@jeldon/schema-graph";
import { jeldonConfig } from "@/lib/jeldon";

const ORG_NAME = jeldonConfig.brand.name;

export function organizationLd(siteUrl: string) {
  return organizationGraph({
    orgType: jeldonConfig.schema.orgType,
    org: jeldonConfig.schema.org,
    siteUrl,
    nap: jeldonConfig.brand.nap,
    tagline: jeldonConfig.brand.tagline,
  });
}

function primaryAuthor(slug?: string) {
  const want = slug ?? jeldonConfig.content.defaultAuthorSlug;
  return jeldonConfig.authors.find((a) => a.slug === want) ?? jeldonConfig.authors[0];
}

/** The author entity node. Emit on pages that reference the author by @id
 *  (articles) so the @id resolves and consolidates E-E-A-T. */
export function personLd(siteUrl: string, authorSlug?: string) {
  const a = primaryAuthor(authorSlug);
  return personGraph({ schemaId: a.schemaId, profile: a.profile, siteUrl });
}

export function faqPageLd(faqs: { q: string; a: string }[]) {
  if (faqs.length === 0) return null;
  return faqPage(faqs);
}

export function articleLd(input: {
  title: string;
  description?: string;
  url: string;
  authorName?: string;
  datePublished?: string;
  dateModified?: string;
  image?: string | null;
  heroAlt?: string | null;
  wordCount?: number;
  section?: string;
  tags?: string[];
  siteUrl: string;
}) {
  const slug = input.url.replace(/\/+$/, "").split("/").pop() ?? "";
  const author = primaryAuthor();
  const node = articleGraph(
    {
      title: input.title,
      slug,
      excerpt: input.description ?? "",
      publishDate: input.datePublished || input.dateModified || new Date().toISOString(),
      updatedDate: input.dateModified ?? input.datePublished,
      category: input.section ?? "",
      categoryLabel: input.section,
      author: input.authorName ?? author.name,
      authorSlug: author.slug, // matches a config author → links by @id
      tags: input.tags ?? [],
      heroImage: input.image ?? undefined,
      heroImageAlt: input.heroAlt ?? "",
    },
    jeldonConfig.authors.map((a) => ({ slug: a.slug, name: a.name, schemaId: a.schemaId })),
    {
      siteUrl: input.siteUrl,
      articleTypes: jeldonConfig.schema.articleTypes,
      schemaPolicy: {
        publishingPrinciplesUrl: jeldonConfig.schema.publishingPrinciplesUrl,
        ...jeldonConfig.schema.articleGraph,
      },
    },
  ) as Record<string, unknown>;

  node.mainEntityOfPage = input.url; // engine assumed /articles/<slug>/
  if (input.wordCount) node.wordCount = input.wordCount;
  node.inLanguage = "en-US";
  return node;
}

// ---------------------------------------------------------------------------
// Course schema — kept (no engine equivalent yet; upstream a `courseGraph`).
// ---------------------------------------------------------------------------
export interface CourseLdInput {
  title: string;
  description?: string | null;
  slug: string;
  priceCents: number;
  creditHours: number;
  instructorName: string;
}

export function courseLd(c: CourseLdInput, siteUrl: string) {
  return {
    "@context": "https://schema.org",
    "@type": "Course",
    name: c.title,
    description: c.description ?? undefined,
    url: `${siteUrl}/courses/${c.slug}`,
    provider: { "@type": "Organization", name: ORG_NAME, url: siteUrl },
    offers: {
      "@type": "Offer",
      price: (c.priceCents / 100).toFixed(2),
      priceCurrency: "USD",
      category: "Paid",
      url: `${siteUrl}/courses/${c.slug}`,
    },
    hasCourseInstance: {
      "@type": "CourseInstance",
      courseMode: "online",
      courseWorkload: `PT${Math.max(1, Math.round(c.creditHours))}H`,
      instructor: { "@type": "Person", name: c.instructorName },
    },
  };
}
