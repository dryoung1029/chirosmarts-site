/**
 * JSON-LD builders for marketing SEO. Pure functions returning plain objects to
 * stringify into <script type="application/ld+json">. Only emit fields backed by
 * real data (DB course facts, owner-supplied copy) — never fabricate claims.
 */
import { LEGAL } from "@/config/legal";

const ORG_NAME = "ChiroSmarts";

export function organizationLd(siteUrl: string) {
  return {
    "@context": "https://schema.org",
    "@type": "Organization",
    name: ORG_NAME,
    legalName: LEGAL.entityName,
    url: siteUrl,
    logo: `${siteUrl}/logo.png`,
    email: LEGAL.contactEmail,
    address: LEGAL.mailingAddress,
  };
}

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

export function faqPageLd(faqs: { q: string; a: string }[]) {
  if (faqs.length === 0) return null;
  return {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: faqs.map((f) => ({
      "@type": "Question",
      name: f.q,
      acceptedAnswer: { "@type": "Answer", text: f.a },
    })),
  };
}

export function articleLd(input: {
  title: string;
  description?: string;
  url: string;
  authorName: string;
  authorCredentials?: string | null;
  authorJobTitle?: string;
  authorUrl?: string;
  authorSameAs?: string[];
  datePublished?: string;
  dateModified?: string;
  image?: string | null;
  wordCount?: number;
  section?: string;
  siteUrl?: string;
}) {
  const author: Record<string, unknown> = {
    "@type": "Person",
    name: input.authorName,
  };
  if (input.authorJobTitle) author.jobTitle = input.authorJobTitle;
  if (input.authorCredentials) author.description = input.authorCredentials;
  if (input.authorUrl) author.url = input.authorUrl;
  if (input.authorSameAs?.length) author.sameAs = input.authorSameAs;

  const publisher: Record<string, unknown> = {
    "@type": "Organization",
    name: ORG_NAME,
  };
  if (input.siteUrl)
    publisher.logo = { "@type": "ImageObject", url: `${input.siteUrl}/logo.png` };

  return {
    "@context": "https://schema.org",
    "@type": "Article",
    headline: input.title,
    description: input.description,
    url: input.url,
    mainEntityOfPage: { "@type": "WebPage", "@id": input.url },
    image: input.image ? [input.image] : undefined,
    author,
    publisher,
    datePublished: input.datePublished,
    dateModified: input.dateModified ?? input.datePublished,
    wordCount: input.wordCount,
    articleSection: input.section,
    inLanguage: "en-US",
  };
}
