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
  datePublished?: string;
  dateModified?: string;
}) {
  return {
    "@context": "https://schema.org",
    "@type": "Article",
    headline: input.title,
    description: input.description,
    url: input.url,
    author: { "@type": "Person", name: input.authorName },
    publisher: { "@type": "Organization", name: ORG_NAME },
    datePublished: input.datePublished,
    dateModified: input.dateModified ?? input.datePublished,
  };
}
