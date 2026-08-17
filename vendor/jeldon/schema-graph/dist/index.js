// src/url.ts
function absUrl(siteUrl, pathOrUrl) {
  if (/^https?:\/\//i.test(pathOrUrl)) return pathOrUrl;
  const base = siteUrl.replace(/\/+$/, "");
  const path = pathOrUrl.startsWith("/") ? pathOrUrl : `/${pathOrUrl}`;
  return `${base}${path}`;
}
function orgId(siteUrl) {
  return `${siteUrl.replace(/\/+$/, "")}/#org`;
}
function websiteId(siteUrl) {
  return `${siteUrl.replace(/\/+$/, "")}/#website`;
}

// src/organization.ts
function fromPack(input) {
  if ("brand" in input && "schema" in input) {
    return {
      orgType: input.schema.orgType,
      org: input.schema.org,
      siteUrl: input.brand.siteUrl,
      nap: input.brand.nap,
      tagline: input.brand.tagline
    };
  }
  return input;
}
function organizationGraph(input) {
  const { orgType, org, siteUrl, nap, tagline } = fromPack(input);
  const id = orgId(siteUrl);
  const node = {
    "@context": "https://schema.org",
    "@type": orgType.length === 1 ? orgType[0] : orgType,
    "@id": id,
    name: org.name,
    url: org.url || siteUrl
  };
  if (org.logoUrl) {
    node.logo = org.logoUrl;
    node.image = org.logoUrl;
  }
  if (tagline) node.slogan = tagline;
  if (nap && (nap.address || nap.city || nap.region || nap.postalCode)) {
    node.address = {
      "@type": "PostalAddress",
      ...nap.address ? { streetAddress: nap.address } : {},
      ...nap.city ? { addressLocality: nap.city } : {},
      ...nap.region ? { addressRegion: nap.region } : {},
      ...nap.postalCode ? { postalCode: nap.postalCode } : {},
      addressCountry: "US"
    };
  }
  if (nap?.phone) node.telephone = nap.phone;
  if (org.sameAs && org.sameAs.length) node.sameAs = org.sameAs;
  if (org.extra) Object.assign(node, org.extra);
  return node;
}
function websiteGraph(input) {
  const { org, siteUrl } = fromPack(input);
  return {
    "@context": "https://schema.org",
    "@type": "WebSite",
    "@id": websiteId(siteUrl),
    url: org.url || siteUrl,
    name: org.name,
    publisher: { "@id": orgId(siteUrl) }
  };
}

// src/person.ts
function personGraph(input) {
  const { schemaId, profile, siteUrl } = input;
  const type = input.type ?? ["Person"];
  const node = {
    "@context": "https://schema.org",
    "@type": type.length === 1 ? type[0] : type,
    "@id": schemaId,
    name: profile.name
  };
  if (profile.jobTitle) node.jobTitle = profile.jobTitle;
  if (profile.url) node.url = profile.url;
  if (profile.image) node.image = profile.image;
  if (profile.knowsAbout && profile.knowsAbout.length) node.knowsAbout = profile.knowsAbout;
  if (profile.alumniOf && profile.alumniOf.length) {
    node.alumniOf = profile.alumniOf.map((name) => ({ "@type": "CollegeOrUniversity", name }));
  }
  if (profile.memberOf && profile.memberOf.length) {
    node.memberOf = profile.memberOf.map((name) => ({ "@type": "Organization", name }));
  }
  if (profile.awards && profile.awards.length) node.award = profile.awards;
  if (profile.sameAs && profile.sameAs.length) node.sameAs = profile.sameAs;
  node.worksFor = { "@id": orgId(siteUrl) };
  if (profile.extra) Object.assign(node, profile.extra);
  return node;
}

// src/article.ts
function toIso(d) {
  return (d instanceof Date ? d : new Date(d)).toISOString();
}
function resolveOptions(arg) {
  if ("brand" in arg && "schema" in arg) {
    return {
      siteUrl: arg.brand.siteUrl,
      articleTypes: arg.schema.articleTypes,
      schemaPolicy: {
        publishingPrinciplesUrl: arg.schema.articleGraph?.publishingPrinciplesUrl ?? arg.schema.publishingPrinciplesUrl,
        ...arg.schema.articleGraph
      }
    };
  }
  return arg;
}
function articleGraph(article, authors, options) {
  const opts = resolveOptions(options);
  const { siteUrl } = opts;
  const articleTypes = opts.articleTypes ?? ["Article"];
  const policy = opts.schemaPolicy ?? {};
  const published = toIso(article.publishDate);
  const modified = article.updatedDate ? toIso(article.updatedDate) : published;
  const canonical = absUrl(siteUrl, `/articles/${article.slug}/`);
  const matched = authors.find((a) => a.slug === article.authorSlug);
  const authorRef = matched ? { "@id": matched.schemaId } : {
    "@type": "Person",
    name: article.author,
    url: absUrl(siteUrl, `/team/${article.authorSlug}`)
  };
  const node = {
    "@context": "https://schema.org",
    "@type": articleTypes.length === 1 ? articleTypes[0] : articleTypes,
    headline: article.title,
    description: article.excerpt,
    datePublished: published,
    dateModified: modified,
    author: authorRef,
    publisher: { "@id": orgId(siteUrl) },
    mainEntityOfPage: canonical
  };
  if (policy.reviewerSchemaId) {
    node.reviewedBy = { "@id": policy.reviewerSchemaId };
    if (policy.emitLastReviewed !== false) {
      node.lastReviewed = modified.slice(0, 10);
    }
  }
  if (policy.publishingPrinciplesUrl) {
    node.publishingPrinciples = policy.publishingPrinciplesUrl;
  }
  if (article.heroImage) {
    const dims = policy.heroImageDimensions;
    node.image = {
      "@type": "ImageObject",
      url: absUrl(siteUrl, article.heroImage),
      caption: article.heroImageAlt ?? article.title,
      ...dims ? { width: dims.width, height: dims.height } : {}
    };
  }
  if (article.categoryLabel) node.articleSection = article.categoryLabel;
  if (article.tags.length) node.keywords = article.tags.join(", ");
  if (article.sourceEpisode) {
    node.isBasedOn = {
      "@type": "PodcastEpisode",
      url: article.sourceEpisode,
      ...policy.sourceEpisodeSeriesName ? {
        partOfSeries: {
          "@type": "PodcastSeries",
          name: policy.sourceEpisodeSeriesName
        }
      } : {}
    };
  }
  return node;
}

// src/breadcrumb.ts
function breadcrumbList(crumbs, siteUrl) {
  return {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: crumbs.map((c, i) => ({
      "@type": "ListItem",
      position: i + 1,
      name: c.name,
      item: absUrl(siteUrl, c.url)
    }))
  };
}

// src/faqs.ts
function extractFaqs(body) {
  const lines = body.split(/\r?\n/);
  const questionStart = /^(why|what|how|should|is|are|can|could|do|does|did|will|would|when|where|who)\b/i;
  const faqs = [];
  for (let i = 0; i < lines.length; i++) {
    const m = lines[i].match(/^##\s+(.+?)\s*$/);
    if (!m) continue;
    const q = m[1].trim();
    if (!(q.endsWith("?") || questionStart.test(q))) continue;
    const answerLines = [];
    for (let j = i + 1; j < lines.length; j++) {
      const line = lines[j];
      if (/^#{1,6}\s/.test(line)) break;
      if (/^```/.test(line)) break;
      if (line.trim() === "") {
        if (answerLines.length > 0) break;
        continue;
      }
      answerLines.push(line.trim());
    }
    if (answerLines.length === 0) continue;
    const a = answerLines.join(" ").replace(/!\[[^\]]*\]\([^)]+\)/g, "").replace(/\[([^\]]+)\]\([^)]+\)/g, "$1").replace(/[*_`]/g, "").replace(/\s+/g, " ").trim();
    if (!a) continue;
    faqs.push({ q, a });
  }
  return faqs;
}
function faqPage(faqs) {
  return {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: faqs.map((f) => ({
      "@type": "Question",
      name: f.q,
      acceptedAnswer: { "@type": "Answer", text: f.a }
    }))
  };
}

// src/llms-txt.ts
var NullWriter = { write() {
} };
function fsWriter() {
  return {
    async write(path, contents) {
      const { writeFile, mkdir } = await import("fs/promises");
      const { dirname } = await import("path");
      await mkdir(dirname(path), { recursive: true });
      await writeFile(path, contents, "utf8");
    }
  };
}
function renderLlmsTxt(input) {
  const out = [];
  out.push(`# ${input.brandName}`);
  out.push("");
  if (input.summary) {
    out.push(`> ${input.summary}`);
    out.push("");
  }
  if (input.intro) {
    out.push(input.intro.trim());
    out.push("");
  }
  for (const section of input.sections ?? []) {
    out.push(`## ${section.heading}`);
    out.push("");
    for (const item of section.items) {
      if (typeof item === "string") {
        out.push(item.startsWith("-") ? item : `- ${item}`);
      } else {
        const link = item.url ? `[${item.label}](${item.url})` : item.label;
        out.push(item.note ? `- ${link}: ${item.note}` : `- ${link}`);
      }
    }
    out.push("");
  }
  return out.join("\n").replace(/\n{3,}/g, "\n\n").trimEnd() + "\n";
}
async function emitLlmsTxt(pack, opts = {}) {
  if (!pack.schema.emitLlmsTxt) {
    return { contents: "", emitted: false };
  }
  const cfg = pack.schema.llmsTxt ?? {};
  const contents = renderLlmsTxt({
    brandName: pack.schema.org.name || pack.brand.name,
    summary: cfg.summary ?? pack.brand.tagline,
    intro: cfg.intro,
    sections: cfg.sections
  });
  const writer = opts.writer ?? NullWriter;
  const outPath = opts.outPath ?? "public/llms.txt";
  await writer.write(outPath, contents);
  return { contents, emitted: true };
}

// src/sitemap.ts
function sitemapExcludedArticleUrls(stubs, siteUrl) {
  const out = /* @__PURE__ */ new Set();
  for (const a of stubs) {
    if (a.isDraft) out.add(absUrl(siteUrl, `/articles/${a.slug}/`));
  }
  return out;
}
function sitemapFilter(excluded) {
  return (page) => !excluded.has(page);
}
export {
  NullWriter,
  absUrl,
  articleGraph,
  breadcrumbList,
  emitLlmsTxt,
  extractFaqs,
  faqPage,
  fsWriter,
  orgId,
  organizationGraph,
  personGraph,
  renderLlmsTxt,
  sitemapExcludedArticleUrls,
  sitemapFilter,
  websiteGraph,
  websiteId
};
