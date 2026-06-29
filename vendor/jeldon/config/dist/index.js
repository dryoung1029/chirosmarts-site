// src/schema.ts
import { z } from "zod";
var tuple2 = z.tuple([z.number(), z.number()]);
var orgProfile = z.object({
  name: z.string(),
  url: z.string().url(),
  logoUrl: z.string().optional(),
  sameAs: z.array(z.string()).optional(),
  extra: z.record(z.unknown()).optional()
});
var personProfile = z.object({
  name: z.string(),
  jobTitle: z.string().optional(),
  url: z.string().optional(),
  image: z.string().optional(),
  knowsAbout: z.array(z.string()).optional(),
  credential: z.string().optional(),
  alumniOf: z.array(z.string()).optional(),
  memberOf: z.array(z.string()).optional(),
  awards: z.array(z.string()).optional(),
  sameAs: z.array(z.string()).optional(),
  extra: z.record(z.unknown()).optional()
});
var geoCheck = z.object({
  id: z.string(),
  label: z.string(),
  weight: z.number().nonnegative(),
  kind: z.enum(["regexCount", "regexPer1k", "questionH2"]),
  patterns: z.array(z.string()).optional(),
  flags: z.string().optional(),
  target: z.enum(["cleaned", "body"]).optional(),
  thresholds: tuple2
});
var geoConfig = z.object({
  floor: z.number().min(0).max(100),
  checks: z.array(geoCheck).min(1)
});
var seoConfig = z.object({
  title: z.object({ good: tuple2, mehMax: z.number() }),
  excerpt: z.object({ good: tuple2, meh: tuple2 }),
  slugMaxLen: z.number().int().positive(),
  wordCount: z.object({ good: tuple2, mehMin: z.number() }),
  bodyChars: z.object({ good: z.number().int().positive(), meh: z.number().int().positive() }),
  h2: z.object({ good: tuple2, meh: tuple2 }),
  internalLinks: z.object({ good: z.number().int().nonnegative(), meh: z.number().int().nonnegative() }),
  tags: z.object({ good: tuple2, mehMin: z.number() }),
  heroAltWords: z.object({ good: tuple2 }),
  reading: z.object({ good: tuple2, mehMax: z.number() }),
  internalLinkPrefixes: z.array(z.string()).min(1),
  referenceSectionNames: z.array(z.string()).min(1),
  evidenceTriggers: z.array(z.string()),
  badFilenameRe: z.string()
});
var citationConfig = z.object({
  policy: z.enum(["direct-source-urls", "search-urls-only", "verifier-required"]),
  forbiddenPatterns: z.array(z.string()),
  referenceFormat: z.string(),
  verifier: z.object({
    kind: z.enum(["none", "cite8", "primary-source"]),
    baseUrl: z.string().optional()
  })
});
var aeoConfig = z.object({
  brandMentions: z.array(z.string()).min(1),
  localSearchLocation: z.string().optional(),
  querySet: z.array(z.object({ id: z.string(), query: z.string(), tags: z.array(z.string()) })).min(1),
  engines: z.array(z.enum(["perplexity", "anthropic", "google-aio", "openai"])).min(1),
  highPriorityTags: z.array(z.string()),
  maxSnapshots: z.number().int().positive().optional()
});
var strategyConfig = z.object({
  thresholds: z.object({
    real404MinRequests: z.number().int().nonnegative(),
    real404HighRequests: z.number().int().nonnegative(),
    serverError5xxMin: z.number().int().nonnegative(),
    serverError5xxHigh: z.number().int().nonnegative(),
    topContentPaths: z.number().int().positive(),
    geoHighTopRank: z.number().int().positive(),
    geoTargetMargin: z.number().nonnegative(),
    audioTopRank: z.number().int().positive(),
    socialMinReferrers: z.number().int().nonnegative(),
    socialGapFraction: z.number().min(0).max(1),
    socialGapFloor: z.number().nonnegative(),
    climbRankRange: tuple2,
    climbMax: z.number().int().nonnegative(),
    maxRecommendations: z.number().int().positive()
  }),
  siteRoute404Patterns: z.array(z.string()).min(1),
  articlePathPattern: z.string(),
  refererGroups: z.object({
    social: z.array(z.string()),
    search: z.array(z.string())
  }),
  liveCrawlPurpose: z.string(),
  deepLinks: z.record(z.object({ link: z.string(), linkLabel: z.string().optional() })),
  copy: z.record(z.object({ title: z.string(), evidence: z.string() }))
});
var competitorsConfig = z.object({
  ourPlaceId: z.string().optional(),
  ourName: z.string().optional(),
  localPackLocation: z.string().optional(),
  roster: z.array(
    z.object({
      id: z.string(),
      name: z.string(),
      url: z.string(),
      placeId: z.string().optional(),
      targetKeywords: z.array(z.string()).optional()
    })
  ),
  targetKeywords: z.array(z.string()),
  highValuePatterns: z.array(z.string()).optional(),
  skipPatterns: z.array(z.string()).optional(),
  templateVendors: z.array(z.object({ name: z.string(), fingerprints: z.array(z.string()) })).optional()
});
var draftingConfig = z.object({
  models: z.record(z.string()),
  defaultModel: z.string(),
  utilityModel: z.string(),
  draftFloor: z.object({ seo: z.number(), geo: z.number() }),
  wordCountTarget: tuple2,
  bodyCharCeiling: z.number().int().positive(),
  maxTokens: z.object({
    brainstorm: z.number().int().positive(),
    draft: z.number().int().positive(),
    outline: z.number().int().positive(),
    "draft-series": z.number().int().positive(),
    "draft-series-article": z.number().int().positive(),
    fixPass: z.number().int().positive(),
    extractClaims: z.number().int().positive(),
    chat: z.number().int().positive()
  }),
  promptOverrides: z.record(z.string()).optional()
});
var amplifyConfig = z.object({
  channels: z.array(
    z.object({
      id: z.string(),
      label: z.string(),
      guidance: z.string(),
      fieldDescription: z.string(),
      utm: z.string().optional(),
      noUrl: z.boolean().optional()
    })
  ).min(1),
  systemPreamble: z.string(),
  carouselSchemes: z.array(
    z.object({
      id: z.string(),
      label: z.string(),
      bg: z.string(),
      fg: z.string(),
      accent: z.string()
    })
  ).min(1),
  carouselGuidance: z.string(),
  newsletterGuidance: z.string(),
  carouselStateDir: z.string().optional()
});
var mediaConfig = z.object({
  narration: z.object({
    voiceId: z.string(),
    model: z.string(),
    voiceSettings: z.object({
      stability: z.number(),
      similarity_boost: z.number(),
      style: z.number(),
      use_speaker_boost: z.boolean()
    }),
    outroText: z.string(),
    pronunciationOverrides: z.array(z.object({ word: z.string(), ipa: z.string() })),
    abbreviationExpansions: z.array(z.object({ abbr: z.string(), full: z.string() })),
    chunkChars: z.number().int().positive(),
    maxChars: z.number().int().positive(),
    referenceSectionNames: z.array(z.string())
  }),
  heroImage: z.object({
    model: z.string(),
    size: z.string(),
    quality: z.string(),
    promptTemplate: z.string(),
    proposalSystem: z.string()
  }),
  podcast: z.object({
    title: z.string(),
    subtitle: z.string(),
    description: z.string(),
    author: z.string(),
    ownerEmail: z.string(),
    category: z.string(),
    subcategory: z.string().optional(),
    copyright: z.string().optional(),
    language: z.string().optional(),
    coverImage: z.string(),
    charsPerMinute: z.number().positive().optional(),
    trailer: z.object({
      title: z.string(),
      audioPath: z.string(),
      audioSize: z.number().int().nonnegative(),
      duration: z.string(),
      pubDate: z.string(),
      summary: z.string()
    }).optional()
  })
});
var analyticsConfig = z.object({
  aiBotList: z.array(
    z.object({
      match: z.string(),
      bot: z.string(),
      engine: z.string(),
      purpose: z.enum(["train", "index", "live"])
    })
  ).min(1),
  refererChannelMap: z.array(
    z.object({
      label: z.string().optional(),
      needles: z.array(z.string()),
      drop: z.boolean().optional()
    })
  ),
  directLabel: z.string(),
  articlePathPattern: z.string(),
  assetPathPattern: z.string(),
  botUaPattern: z.string(),
  siteRoute404Patterns: z.array(z.string()),
  cloudflare: z.object({
    zoneId: z.string().optional(),
    accountId: z.string().optional(),
    endpoint: z.string().optional()
  }).optional(),
  windowDays: z.number().int().positive(),
  maxDailySnapshots: z.number().int().positive()
});
var entityPresenceConfig = z.object({
  sources: z.array(
    z.object({
      id: z.string(),
      label: z.string(),
      hostNeedles: z.array(z.string()),
      weight: z.number().min(0).max(1),
      napConsistencyChecked: z.boolean().optional()
    })
  ).min(1),
  engineAffinities: z.array(
    z.object({
      engine: z.string(),
      affinity: z.record(z.number().min(0).max(1)),
      note: z.string().optional()
    })
  ),
  consistencyTargets: z.object({
    name: z.string().optional(),
    nap: z.record(z.string())
  }).optional(),
  establishedThreshold: z.number().int().positive().optional()
});
var domainPackSchema = z.object({
  brand: z.object({
    name: z.string().min(1),
    siteUrl: z.string().url(),
    tagline: z.string().optional(),
    geoFraming: z.string().optional(),
    nap: z.object({
      address: z.string().optional(),
      city: z.string().optional(),
      region: z.string().optional(),
      postalCode: z.string().optional(),
      phone: z.string().optional(),
      placeId: z.string().optional()
    }).optional(),
    logoUrl: z.string().optional(),
    brandColors: z.record(z.string()).optional()
  }),
  authors: z.array(
    z.object({
      slug: z.string(),
      name: z.string(),
      title: z.string().optional(),
      schemaId: z.string(),
      profile: personProfile,
      isPrimary: z.boolean().optional()
    })
  ).min(1),
  voice: z.object({
    persona: z.string().min(1),
    bannedTopics: z.array(z.string()),
    bannedPhrasings: z.array(z.string()),
    rules: z.array(z.string()),
    voiceAnchorUrls: z.array(z.string()),
    readingGradeBand: tuple2
  }),
  content: z.object({
    categories: z.array(z.string()).min(1),
    categoryTargets: z.record(z.number().min(0).max(100)),
    defaultAuthorSlug: z.string(),
    timezone: z.string(),
    lifecycle: z.object({ docReviewed: z.boolean().optional() }).optional()
  }),
  scoring: z.object({ geo: geoConfig, seo: seoConfig }),
  citation: citationConfig,
  aeo: aeoConfig,
  competitors: competitorsConfig.optional(),
  strategy: strategyConfig.optional(),
  drafting: draftingConfig.optional(),
  amplify: amplifyConfig.optional(),
  media: mediaConfig.optional(),
  analytics: analyticsConfig.optional(),
  entityPresence: entityPresenceConfig.optional(),
  schema: z.object({
    orgType: z.array(z.string()).min(1),
    org: orgProfile,
    articleTypes: z.array(z.string()).min(1),
    publishingPrinciplesUrl: z.string().optional(),
    articleGraph: z.object({
      reviewerSchemaId: z.string().optional(),
      emitLastReviewed: z.boolean().optional(),
      publishingPrinciplesUrl: z.string().optional(),
      heroImageDimensions: z.object({ width: z.number().int().positive(), height: z.number().int().positive() }).optional(),
      sourceEpisodeSeriesName: z.string().optional()
    }).optional(),
    emitLlmsTxt: z.boolean().optional(),
    llmsTxt: z.object({
      summary: z.string().optional(),
      intro: z.string().optional(),
      sections: z.array(
        z.object({
          heading: z.string(),
          items: z.array(
            z.union([
              z.string(),
              z.object({
                label: z.string(),
                url: z.string().optional(),
                note: z.string().optional()
              })
            ])
          )
        })
      ).optional()
    }).optional()
  }),
  compliance: z.object({
    pack: z.string(),
    reviewResponseRules: z.array(z.string()).optional(),
    requireHumanReviewTags: z.array(z.string()).optional()
  }).optional(),
  capabilities: z.object({
    drafting: z.boolean().optional(),
    amplify: z.boolean().optional(),
    audio: z.boolean().optional(),
    heroImages: z.boolean().optional(),
    competitiveIntel: z.boolean().optional(),
    engagementAnalytics: z.boolean().optional(),
    entityPresence: z.boolean().optional()
  }),
  services: z.object({
    store: z.enum(["github", "fs"]),
    contentDir: z.string().optional(),
    analytics: z.enum(["cloudflare", "none"]).optional(),
    requiredEnv: z.array(z.string())
  })
}).superRefine((pack, ctx) => {
  const targets = Object.values(pack.content.categoryTargets);
  if (targets.length) {
    const minTarget = Math.min(...targets);
    if (pack.scoring.geo.floor > minTarget) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["scoring", "geo", "floor"],
        message: `GEO floor (${pack.scoring.geo.floor}) must be <= the lowest category target (${minTarget}).`
      });
    }
  }
  for (const cat of Object.keys(pack.content.categoryTargets)) {
    if (!pack.content.categories.includes(cat)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["content", "categoryTargets", cat],
        message: `categoryTargets references "${cat}" which is not in content.categories.`
      });
    }
  }
  if (!pack.authors.some((a) => a.slug === pack.content.defaultAuthorSlug)) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["content", "defaultAuthorSlug"],
      message: `defaultAuthorSlug "${pack.content.defaultAuthorSlug}" matches no author slug.`
    });
  }
});

// src/defaults.ts
var defaultGeoConfig = {
  floor: 70,
  checks: [
    {
      id: "statistic",
      label: "Statistic density",
      weight: 25,
      kind: "regexPer1k",
      target: "cleaned",
      patterns: ["(\\d+(?:\\.\\d+)?\\s*%|\\b\\d+\\s*[-\\u2013\\u2014]\\s*\\d+\\b|\\b\\d{1,4}(?:[,.]\\d+)?\\b)"],
      flags: "g",
      thresholds: [10, 5]
    },
    {
      id: "quote",
      label: "Direct quotes (attributed)",
      weight: 25,
      kind: "regexCount",
      target: "cleaned",
      patterns: ['"[^"]{20,300}"[\\s\\S]{0,80}?(?:\\bet al\\b|\\bguideline\\b|\\bstudy\\b|\\btrial\\b|\\breview\\b|\\(\\d{4}\\)|\\b\\d{4}\\b)'],
      flags: "gi",
      thresholds: [2, 1]
    },
    {
      id: "citation",
      label: "Citation density",
      weight: 15,
      kind: "regexPer1k",
      target: "body",
      patterns: ["pubmed\\.ncbi\\.nlm\\.nih\\.gov|doi\\.org\\/|pmid[:\\s]*\\d|PMC\\d{5,}"],
      flags: "gi",
      thresholds: [2, 1]
    },
    {
      id: "firstPerson",
      label: "First-person markers",
      weight: 15,
      kind: "regexCount",
      target: "cleaned",
      patterns: ["\\bwhen I\\b|\\bI (?:see|find|treat|tell|recommend|use|approach|look|hear|order|refer)\\b|\\bin our (?:clinic|practice|office)\\b|\\bour patients\\b|\\bwe (?:see|treat|find|use|recommend|order|refer)\\b"],
      flags: "gi",
      thresholds: [4, 2]
    },
    {
      id: "questionH2",
      label: "Question H2s",
      weight: 10,
      kind: "questionH2",
      patterns: ["what", "when", "why", "how", "can", "do", "does", "is", "are", "should", "will", "who"],
      thresholds: [2, 1]
    },
    {
      id: "authority",
      label: "Authority markers",
      weight: 10,
      kind: "regexCount",
      target: "cleaned",
      patterns: ["\\baccording to\\b|\\bas reported by\\b|\\bpublished in\\b|\\bet al\\.?\\b|\\bguidelines?\\b|\\bcohort\\b|\\bRCT\\b|\\brandomi[sz]ed\\b|\\bmeta[- ]?analys[ei]s\\b|\\bsystematic review\\b|\\bcochrane\\b"],
      flags: "gi",
      thresholds: [3, 1]
    }
  ]
};
var defaultSeoConfig = {
  title: { good: [40, 60], mehMax: 70 },
  excerpt: { good: [120, 160], meh: [80, 200] },
  slugMaxLen: 60,
  wordCount: { good: [800, 2200], mehMin: 500 },
  bodyChars: { good: 1e4, meh: 12e3 },
  h2: { good: [3, 6], meh: [2, 8] },
  internalLinks: { good: 2, meh: 1 },
  tags: { good: [3, 6], mehMin: 1 },
  heroAltWords: { good: [4, 18] },
  reading: { good: [6, 9], mehMax: 11 },
  internalLinkPrefixes: ["articles", "conditions", "care", "team"],
  referenceSectionNames: ["references", "citations", "sources", "bibliography", "further reading", "works cited"],
  evidenceTriggers: ["studies", "study", "research", "evidence", "trials", "meta-analysis", "systematic reviews", "cochrane", "literature", "guidelines", "RCT", "randomized"],
  badFilenameRe: "^(img[_-]?\\d|dsc[_-]?\\d|photo[_-]?\\d|untitled|screenshot|image\\d|pasted)"
};
var defaultScoringConfig = {
  geo: defaultGeoConfig,
  seo: defaultSeoConfig
};
var defaultStrategyConfig = {
  thresholds: {
    real404MinRequests: 8,
    real404HighRequests: 50,
    serverError5xxMin: 100,
    serverError5xxHigh: 500,
    topContentPaths: 12,
    geoHighTopRank: 3,
    geoTargetMargin: 5,
    audioTopRank: 5,
    socialMinReferrers: 20,
    socialGapFraction: 0.03,
    socialGapFloor: 5,
    climbRankRange: [4, 10],
    climbMax: 2,
    maxRecommendations: 12
  },
  // Positive-match families for OUR content URLs (BoH SITE_ROUTE_404). A 404 on
  // one of these is a broken internal link or an old URL worth a 301; every
  // other 404 is bot/scanner noise and stays silent.
  siteRoute404Patterns: [
    "^/articles/[a-z0-9-]+/?$",
    "^/conditions/[a-z0-9-]+/?$",
    "^/care/[a-z0-9-]+(/[a-z0-9-]+)?/?$",
    "^/team/[a-z0-9-]+/?$",
    "^/locations/[a-z0-9-]+/?$"
  ],
  articlePathPattern: "^/articles/([^/]+)$",
  refererGroups: {
    social: ["facebook", "instagram", "x /", "twitter", "linkedin", "youtube"],
    search: ["google search", "google"]
  },
  liveCrawlPurpose: "live",
  deepLinks: {
    brokenLinks: { link: "/admin/links", linkLabel: "Broken links" },
    editArticle: { link: "/admin/{slug}", linkLabel: "Edit" },
    amplify: { link: "/admin", linkLabel: "Pick an article \u2192 Amplify" },
    priorityKeywords: { link: "/admin/competitors/priority-keywords", linkLabel: "Priority keywords" }
  },
  copy: {
    "health-404": {
      title: "Real 404s to fix",
      evidence: "Real site paths returning 404 (bot/scanner noise excluded): {offenders}. 301 each to its current page, or fix the link pointing at it. The overall 404 rate is higher but is dominated by harmless automated probes, which don\u2019t need action."
    },
    "health-5xx": {
      title: "Server/origin errors to investigate",
      evidence: "{count} 5xx responses over {windowDays}d ({detail}). 52x = the edge couldn\u2019t reach the origin; 500s may be Function errors."
    },
    "geo-citability": {
      title: 'Strengthen "{title}" for AI citation',
      evidence: "A top-traffic page ({requests} requests/{windowDays}d) scoring GEO {geo} vs the {target} target for {category}. High traffic + low citability is answer-engine surface left on the table."
    },
    "audio-coverage": {
      title: 'Add narration to "{title}"',
      evidence: "A top-{rank} page by traffic with no audio \u2014 a quick win for the podcast feed and on-page engagement."
    },
    "dist-social": {
      title: "Almost no social referrals \u2014 amplify your top pages",
      evidence: "Social sent ~{social} visits over {referrersDays}d vs {search} from search. Run the Amplify kit on your highest-traffic articles to seed social channels."
    },
    "seo-climb": {
      title: 'Climb "{keyword}" (rank #{rank})',
      evidence: 'Search is already a top referrer, and you sit at #{rank} for "{keyword}" \u2014 the page-2-to-1 range where small gains convert. Strengthen the matching page.'
    },
    "aeo-live-crawl": {
      title: "Answer engines are fetching you live \u2014 verify citations",
      evidence: "{live} live-retrieval crawler hits (ChatGPT / Perplexity / Claude users) in the last day. Check the Answer-engine presence panel \u2014 crawled-but-not-cited is a citability gap to close."
    }
  }
};
var defaultDraftingConfig = {
  models: {
    sonnet: "claude-sonnet-4-6",
    opus: "claude-opus-4-7",
    haiku: "claude-haiku-4-5"
  },
  defaultModel: "sonnet",
  utilityModel: "haiku",
  draftFloor: { seo: 70, geo: 70 },
  wordCountTarget: [800, 1500],
  bodyCharCeiling: 1e4,
  maxTokens: {
    brainstorm: 1500,
    draft: 16e3,
    outline: 4e3,
    "draft-series": 64e3,
    "draft-series-article": 12e3,
    fixPass: 16e3,
    extractClaims: 1500,
    chat: 32e3
  }
};
var defaultAmplifyConfig = {
  systemPreamble: "You are a content distribution editor. A new article was just published, and you are producing copy for every channel it gets distributed through. Each piece pushes traffic to the article URL while standing on its own \u2014 readers should not need to click to get value. Match the brand voice across all channels; do not translate clinical/expert clarity into marketing speak.",
  channels: [
    {
      id: "gbp",
      label: "Google Business Profile post",
      utm: "utm_source=gbp&utm_medium=organic",
      guidance: 'GOOGLE BUSINESS PROFILE POST\n- 750-character HARD LIMIT (Google truncates beyond this \u2014 count carefully).\n- Open with a hook that names the reader problem. End with a CTA + the article URL.\n- One emoji max, used purposefully or not at all.\n- No hashtags (Google ignores them).\n- This is for local-search prospects who already found the business \u2014 bias toward "here is what we would actually do about this."',
      fieldDescription: "Google Business Profile post. \u2264750 characters including the URL."
    },
    {
      id: "facebook",
      label: "Facebook post",
      utm: "utm_source=facebook&utm_medium=social",
      guidance: "FACEBOOK POST\n- 200-500 chars is the sweet spot. Engagement comes from a question or counter-intuitive opener.\n- One emoji is fine, hashtags hurt rather than help on FB. Skip them.\n- End with the article URL on its own line so Facebook auto-previews.",
      fieldDescription: "Facebook post. 200-500 chars + URL on its own final line."
    },
    {
      id: "instagram",
      label: "Instagram caption",
      guidance: 'INSTAGRAM CAPTION\n- 800-1500 chars works. Story-driven: open with a scene, pull to the article main insight, close with a CTA.\n- 5-10 relevant hashtags at the bottom (mix of broad and local). NOT keyword-stuffed.\n- Note: IG does not make a link in the caption clickable. CTA should say "link in bio" \u2014 do not paste the URL.',
      fieldDescription: 'Instagram caption. 800-1500 chars + 5-10 hashtags. CTA says "link in bio".'
    },
    {
      id: "linkedin",
      label: "LinkedIn post",
      utm: "utm_source=linkedin&utm_medium=social",
      guidance: "LINKEDIN POST\n- 700-1500 chars. Frame the author as a practitioner, not a marketer. Structure: observation from practice \u2192 tension/insight \u2192 what they do about it \u2192 optional question.\n- Line breaks are critical on LinkedIn (every 1-2 sentences). Use them aggressively.\n- 3-5 hashtags MAX, mostly professional. Article URL at the end.",
      fieldDescription: "LinkedIn post. 700-1500 chars + 3-5 professional hashtags + URL."
    },
    {
      id: "newsletterSubject",
      label: "Newsletter subject line",
      noUrl: true,
      guidance: `NEWSLETTER SUBJECT
- 40-60 chars, intriguing without being clickbait. No "You won't believe..." energy.`,
      fieldDescription: "Email subject line, 40-60 chars."
    },
    {
      id: "newsletterBody",
      label: "Newsletter body",
      utm: "utm_source=newsletter&utm_medium=email",
      guidance: 'NEWSLETTER BODY\n- 80-130 words. Frame the article in context \u2014 what prompted it, what readers get. End with a clear "Read it here:" + link placeholder.',
      fieldDescription: 'Email body, 80-130 words. Ends with "Read it here:" + URL.'
    },
    {
      id: "podcastHook",
      label: "Podcast hook",
      noUrl: true,
      guidance: "PODCAST HOOK\n- A 2-3 sentence pitch for a podcast episode that builds on this article angle. Suggest a guest, a specific opening question, or a related-but-deeper angle worth a 30-minute conversation. Not the article rehashed \u2014 a logical next.",
      fieldDescription: "2-3 sentence pitch for a podcast episode that builds on this article."
    }
  ],
  carouselSchemes: [
    { id: "cream-burgundy", label: "Cream + Burgundy", bg: "#f5f0e6", fg: "#a03038", accent: "#000000" },
    { id: "white-black", label: "White + Black", bg: "#ffffff", fg: "#000000", accent: "#a03038" },
    { id: "black-cream", label: "Black + Cream", bg: "#000000", fg: "#f5f0e6", accent: "#d65560" },
    { id: "burgundy-cream", label: "Burgundy + Cream", bg: "#a03038", fg: "#f5f0e6", accent: "#ffffff" },
    { id: "tan-black", label: "Tan + Black", bg: "#c8b8a0", fg: "#000000", accent: "#a03038" },
    { id: "coral-white", label: "Coral + White", bg: "#d65560", fg: "#ffffff", accent: "#000000" },
    { id: "blush-burgundy", label: "Blush + Burgundy", bg: "#fef0f1", fg: "#a03038", accent: "#000000" },
    { id: "black-white", label: "Black + White", bg: "#000000", fg: "#ffffff", accent: "#c8b8a0" }
  ],
  carouselGuidance: `You design Instagram text carousels. Carousels live or die on slide 1. Engineer a sequence that REWARDS the swipe at every step \u2014 readers should feel something is missing if they stop on any slide before the end.

SLIDE 1 \u2014 THE HOOK
Must be hard to scroll past. Use one of: a pattern interrupt (a claim that contradicts assumption), specificity + authority (a real number from experience), a named myth, a curiosity gap (a question the next slide answers), or pattern + counter (set an expectation, then break it).
NEVER: declarative statements that could appear in any generic blog, "Did you know\u2026" prefixes, vague "5 things\u2026" intros, emoji.

SLIDES 2 through N-1 \u2014 PROGRESSIVE REVEAL
Each slide must end on an OPEN LOOP \u2014 something the reader needs the next slide to resolve. setup \u2192 tension \u2192 resolution \u2192 next setup. ONE idea per slide. 4-14 word body MAX \u2014 headline energy, not paragraphs.

LAST TEXT SLIDE (N) \u2014 THE PAYOFF
The reveal that ties it together. NOT a CTA \u2014 the hero slide handles that. Must feel earned.

SLIDE-LEVEL RULES
- BODY: 4-14 words, treat as a headline.
- KICKER (optional small label above body): use SPARINGLY for slot labels like "1/6", "THE MYTH", "BOTTOM LINE".
- FOOTER (optional small label below body): rarely used.
- No emoji or hashtags in slides (those belong in the caption).
- Vary slide structure \u2014 not every slide should have a kicker.

REFINEMENT MODE
If a <current_carousel> block is present, PRESERVE every slide and field exactly EXCEPT what the refinement explicitly asks to change. Positional vocabulary: "top"/"above" \u2192 kicker; "middle"/"headline" \u2192 body; "bottom"/"below"/"footer" \u2192 footer; "slide N" \u2192 that index.`,
  newsletterGuidance: `You are writing the newsletter email that goes to subscribers about a just-published article.

Newsletter shape:
- Subject line: 40-60 characters. Intriguing without clickbait. No "You won't believe\u2026" energy. Skip emoji unless it earns its keep.
- Body: 80-130 words. Frame what prompted the article and what readers get from it. Treat it as a personal note from the author, not a press release. Do NOT include "Read it here:" or any URL \u2014 the email template handles the CTA. End with a sentence that lands; the template adds the button.

The subscriber already opted in. You don't need to sell them on existing \u2014 sell them on this specific piece.`,
  carouselStateDir: "src/data/carousel-state"
};
var defaultMediaConfig = {
  narration: {
    voiceId: "ub1bdJ7dPhQjIuMcGZiq",
    model: "eleven_multilingual_v2",
    voiceSettings: {
      stability: 0.3,
      similarity_boost: 0.8,
      style: 0.25,
      use_speaker_boost: true
    },
    outroText: "Thanks for listening. If you found this useful, share it with someone who'd benefit. I'm Dr. Jason Young \u2014 more evidence-informed musculoskeletal content at yourbodyofhealth.com. Subscribe to our newsletter or R S S feed there to know when we publish something new.",
    pronunciationOverrides: [
      { word: "neuromusculoskeletal", ipa: "\u02CCn\u028Aro\u028A\u02CCm\u028Cskj\u0259l\u0259\u02C8sk\u025Bl\u0259t\u0259l" },
      { word: "musculoskeletal", ipa: "\u02CCm\u028Cskj\u0259l\u0259\u02C8sk\u025Bl\u0259t\u0259l" },
      { word: "skeletal", ipa: "\u02C8sk\u025Bl\u0259t\u0259l" },
      { word: "Corvallis", ipa: "k\u0254r\u02C8v\xE6l\u0259s" },
      { word: "Willamette", ipa: "w\u026A\u02C8l\xE6m\u026At" }
    ],
    abbreviationExpansions: [
      { abbr: "MPH", full: "miles per hour" },
      { abbr: "mph", full: "miles per hour" },
      { abbr: "MPG", full: "miles per gallon" },
      { abbr: "BPM", full: "beats per minute" },
      { abbr: "BMI", full: "B M I" },
      { abbr: "BP", full: "blood pressure" },
      { abbr: "ROM", full: "range of motion" },
      { abbr: "NSAIDs", full: "N-saids" },
      { abbr: "NSAID", full: "N-said" },
      { abbr: "OTC", full: "over the counter" },
      { abbr: "MRI", full: "M R I" },
      { abbr: "CT", full: "C T" },
      { abbr: "EKG", full: "E K G" },
      { abbr: "ECG", full: "E C G" },
      { abbr: "OBGYN", full: "O B G Y N" },
      { abbr: "PT", full: "physical therapy" },
      { abbr: "OT", full: "occupational therapy" },
      { abbr: "PIP", full: "P I P" },
      { abbr: "UM", full: "U M" },
      { abbr: "VA", full: "V A" },
      { abbr: "RCT", full: "randomized controlled trial" },
      { abbr: "RCTs", full: "randomized controlled trials" },
      { abbr: "TBI", full: "T B I" },
      { abbr: "ACL", full: "A C L" },
      { abbr: "MCL", full: "M C L" },
      { abbr: "TMJ", full: "T M J" },
      { abbr: "SI", full: "S I" }
    ],
    chunkChars: 9e3,
    maxChars: 3e4,
    referenceSectionNames: [
      "references",
      "citations",
      "sources",
      "bibliography",
      "further reading",
      "works cited",
      "notes"
    ]
  },
  heroImage: {
    model: "gpt-image-2",
    size: "1024x1536",
    quality: "medium",
    promptTemplate: `Minimalist editorial illustration in a hand-drawn felt-marker sketch style inspired by historical medical notebook drawings and visual whiteboard storytelling.

Background should be warm off-white or soft cream (#f5f0e6) with subtle paper texture.

Illustration style uses expressive black ink lines with visible hand-drawn imperfections, variable stroke thickness, crosshatching, sketch shading, and occasional marker bleed. The image should feel intelligently human-made, not digitally polished.

Primary accent color palette:
- Deep burgundy #a03038
- Warm tan #c8b8a0
- Muted coral #d65560
- Soft blush #fef0f1

Use color sparingly and intentionally:
- Burgundy for emphasis, titles, arrows, pain areas, important words
- Tan for dividers, highlights, quote boxes, or subtle backgrounds

Layout style:
- Visual sketchnote / infographic composition
- Handwritten typography
- Strong visual hierarchy
- Multiple simple panels or sections
- Large bold headline
- Minimal clutter
- Easy to understand in under 3 seconds

Include:
- hand-drawn arrows
- doodles and symbolic icons
- simplified anatomy
- stick-figure style humans when appropriate
- historical sketch energy
- negative space
- slightly asymmetrical layout for authenticity

Faces should look like ink sketch portraits rather than cartoons. Historical figures should resemble vintage newspaper or notebook illustrations with crosshatching and engraved-style pen detail.

Avoid:
- glossy gradients
- corporate vector graphics
- photorealism
- stock illustration aesthetics
- overly polished symmetry
- AI-generated "medical brochure" look
- 3D rendering
- typos, misspellings, garbled or invented words in any handwritten text
- repeated text, duplicate labels, or the same headline appearing twice

Every word visible in the image must be a real, correctly-spelled English word. Each headline and label appears exactly once.

Overall mood: evidence-based, historical, thoughtful, rebellious, intelligent, approachable, human.

Topic: {TOPIC}

Core visual concept: {CONCEPT}

Format: vertical 4:5 editorial composition optimized for blog posts and social media.`,
    proposalSystem: `You are an art director for Body of Health, a chiropractic clinic in Corvallis, Oregon. Every article gets a hero illustration in the SAME locked style \u2014 "PTCH Heritage Sketch": historical medical notebook meets editorial sketchnote meets felt-marker whiteboard. Hand-drawn black ink with crosshatching, expressive imperfections, and sparse intentional accent color on warm cream paper. Energy: evidence-based, historical, thoughtful, rebellious. Think 19th-century anatomy notebook redrawn by a sharp modern editor with a felt-tip pen and an opinion. You are NOT inventing the style; you are filling exactly two slots in a locked master template.

The image is built from these ingredients (the template provides the technique \u2014 you don't):
- Black ink line work, crosshatching, sketch shading, marker bleed, variable stroke thickness
- Multiple simple panels OR a single composition \u2014 both fit the style. Pick whichever serves the idea.
- Handwritten typography for headlines and labels (sometimes you'll specify what the headline says)
- Hand-drawn arrows, doodles, symbolic icons, simplified anatomy
- Stick-figure humans for action/posture, ink-sketch portraits for named people (engraved newspaper-style crosshatching for historical figures)
- Sparse, intentional accent color: burgundy for emphasis/titles/arrows/pain areas/important words; tan for dividers/highlights/quote boxes/subtle backgrounds
- Slight asymmetry \u2014 never overly polished symmetry
- Negative space, but not minimalism for its own sake. Dense detail is fine when it earns the page.

Your job: read the article and decide WHAT the page shows \u2014 nothing about technique, palette, or rendering.

GOOD concepts share these traits: they fit the heritage/notebook/rebellious tone, they can be drawn entirely in ink + accent color, they reward a 3-second skim AND a 30-second read. Several shapes work well:

  \u2022 Multi-panel sketchnote
  \u2022 Historical figure + commentary
  \u2022 Anatomy notebook diagram
  \u2022 Metaphor with labels
  \u2022 Cause-and-effect editorial spread
  \u2022 Mythbuster contrast

REQUIRED in every CONCEPT:
- State the layout explicitly (single composition vs multiple panels \u2014 and how many)
- State what any handwritten typography says (headlines, labels, quotes) \u2014 these are part of the image
- State WHERE the accent colors land (burgundy on X, tan dividers on Y) \u2014 never just "use accent colors"
- If portraits are involved, say so and specify the style (engraved-newspaper crosshatching for historical figures, three-quarter ink-sketch for patients)
- Lean into the historical/notebook/rebellious energy \u2014 boring "explainer infographic" concepts get rewritten

HARD BANS \u2014 never describe any of these:
- Photographic realism, photorealism, 3D rendering, glossy surfaces, color gradients, soft focus, depth of field
- Cartoony Pixar-style human faces (use stick figures or ink-sketch portraits only)
- The AI-generic medical illustration trope set: glowing nervous systems, holographic spines, color-saturated chakra anatomy, hands holding holograms, doctor in white coat smiling, anatomy in front of a starscape, person looking thoughtfully at a tablet
- Clip art, rounded-corner shapes, decorative ribbons or badges, "infographic" iconography
- Polished corporate vector graphics, perfect geometric symmetry
- Rendered medical equipment

Output requirements:
1. TOPIC: 3-10 word noun phrase naming the article subject.
2. CONCEPT: 3-6 sentences. Specific about LAYOUT, what each element shows, what any handwritten text says, and where accent colors land.
3. ALT TEXT: 8-15 words describing what the image SHOWS. Plain factual sentence.
4. FILENAME: lowercase, hyphen-separated, .webp extension, derived from the article slug + 1-2 word purpose tag.
5. RATIONALE: one sentence on why this concept fits the article AND the heritage style.`
  },
  podcast: {
    title: "Body of Health \u2014 Read by Dr. Young",
    subtitle: "Evidence-informed chiropractic and musculoskeletal health, narrated.",
    description: "Every article from Body of Health Chiropractic & Wellness Center in Corvallis, Oregon, narrated in Dr. Jason Young's voice. Direct, evidence-informed takes on chiropractic care, musculoskeletal health, sports injuries, auto injuries, pregnancy care, and the practice of medicine. Audio is AI-generated from a voice clone of Dr. Young, with his approval, from the same articles published at yourbodyofhealth.com.",
    author: "Dr. Jason Young, DC",
    ownerEmail: "contact@yourbodyofhealth.com",
    category: "Health & Fitness",
    subcategory: "Alternative Health",
    copyright: "\xA9 Body of Health Chiropractic & Wellness Center",
    language: "en-us",
    coverImage: "/images/body-of-health-logo-only-white-bg.png",
    charsPerMinute: 950,
    trailer: {
      title: "Welcome \u2014 what this feed is, and how the articles get written",
      audioPath: "/audio/podcast-intro.mp3",
      audioSize: 1830770,
      duration: "01:54",
      pubDate: (/* @__PURE__ */ new Date("2026-05-28T00:00:00Z")).toUTCString(),
      summary: "A short introduction to Body of Health \u2014 Read by Dr. Young. What\u2019s on this feed, how every article is clinician-reviewed and citation-verified through cite8, and a candid note about the AI voice. About two minutes."
    }
  }
};
var defaultEntityPresenceConfig = {
  sources: [
    {
      id: "reddit",
      label: "Reddit",
      hostNeedles: ["reddit.com"],
      weight: 1,
      napConsistencyChecked: false
    },
    {
      id: "wikipedia",
      label: "Wikipedia",
      hostNeedles: ["wikipedia.org"],
      weight: 0.9,
      napConsistencyChecked: false
    },
    {
      id: "quora",
      label: "Quora",
      hostNeedles: ["quora.com"],
      weight: 0.5,
      napConsistencyChecked: false
    },
    {
      id: "youtube",
      label: "YouTube",
      hostNeedles: ["youtube.com", "youtu.be"],
      weight: 0.6,
      napConsistencyChecked: false
    },
    {
      id: "comparison-listicle",
      label: 'Comparison / "best-of" listicle',
      hostNeedles: ["yelp.com", "healthgrades.com", "expertise.com", "threebestrated.com"],
      weight: 0.8,
      napConsistencyChecked: true
    },
    {
      id: "directory",
      label: "Business directory",
      hostNeedles: ["mapquest.com", "bbb.org", "chamberofcommerce.com", "manta.com"],
      weight: 0.4,
      napConsistencyChecked: true
    }
  ],
  // Documented per-engine retrieval leanings (directional — the playbook treats
  // these as starting weights, not gospel; a domain re-tunes from its own
  // @jeldon/aeo-audit citation data).
  engineAffinities: [
    {
      engine: "perplexity",
      affinity: { reddit: 1, wikipedia: 0.6, "comparison-listicle": 0.7, quora: 0.5, youtube: 0.4, directory: 0.3 },
      note: "Leans hard on Reddit + fresh discussion threads."
    },
    {
      engine: "anthropic",
      affinity: { wikipedia: 0.9, "comparison-listicle": 0.8, reddit: 0.6, directory: 0.5, quora: 0.4, youtube: 0.3 },
      note: "Favors structured, depth-rich, well-sourced surfaces."
    },
    {
      engine: "openai",
      affinity: { wikipedia: 1, reddit: 0.7, "comparison-listicle": 0.6, quora: 0.5, youtube: 0.4, directory: 0.4 },
      note: "Consensus/Wikipedia-weighted; rewards broad agreement."
    },
    {
      engine: "google-aio",
      affinity: { "comparison-listicle": 0.9, directory: 0.7, reddit: 0.6, wikipedia: 0.6, youtube: 0.5, quora: 0.3 },
      note: "Mirrors organic SERP authority \u2014 listicles + directories."
    }
  ],
  establishedThreshold: 3
};
var defaultAnalyticsConfig = {
  aiBotList: [
    { match: "OAI-SearchBot", bot: "OAI-SearchBot", engine: "openai", purpose: "index" },
    { match: "ChatGPT-User", bot: "ChatGPT-User", engine: "openai", purpose: "live" },
    { match: "GPTBot", bot: "GPTBot", engine: "openai", purpose: "train" },
    { match: "Claude-SearchBot", bot: "Claude-SearchBot", engine: "anthropic", purpose: "index" },
    { match: "Claude-User", bot: "Claude-User", engine: "anthropic", purpose: "live" },
    { match: "ClaudeBot", bot: "ClaudeBot", engine: "anthropic", purpose: "train" },
    { match: "claude-web", bot: "claude-web", engine: "anthropic", purpose: "live" },
    { match: "anthropic-ai", bot: "anthropic-ai", engine: "anthropic", purpose: "train" },
    { match: "Perplexity-User", bot: "Perplexity-User", engine: "perplexity", purpose: "live" },
    { match: "PerplexityBot", bot: "PerplexityBot", engine: "perplexity", purpose: "index" },
    { match: "Google-Extended", bot: "Google-Extended", engine: "google", purpose: "train" },
    { match: "GoogleOther", bot: "GoogleOther", engine: "google", purpose: "index" },
    { match: "Bytespider", bot: "Bytespider", engine: "bytedance", purpose: "train" },
    { match: "Amazonbot", bot: "Amazonbot", engine: "amazon", purpose: "index" },
    { match: "YouBot", bot: "YouBot", engine: "you", purpose: "index" },
    { match: "DuckAssistBot", bot: "DuckAssistBot", engine: "duckduckgo", purpose: "live" },
    { match: "MistralAI-User", bot: "MistralAI-User", engine: "mistral", purpose: "live" },
    { match: "Meta-ExternalAgent", bot: "Meta-ExternalAgent", engine: "meta", purpose: "train" },
    { match: "Applebot-Extended", bot: "Applebot-Extended", engine: "apple", purpose: "train" },
    { match: "CCBot", bot: "CCBot", engine: "commoncrawl", purpose: "train" },
    { match: "cohere-ai", bot: "cohere-ai", engine: "cohere", purpose: "train" }
  ],
  refererChannelMap: [
    { needles: ["yourbodyofhealth.com"], drop: true },
    // internal nav
    { needles: ["cloudflareaccess.com"], drop: true },
    // admin auth redirect
    { label: "Newsletter", needles: ["sendib", "sendinblue", "brevo", "newsletter", "email"] },
    { label: "Google Search", needles: ["google."] },
    { label: "Google Business", needles: ["gbp", "gmb", "google-business"] },
    { label: "Bing", needles: ["bing."] },
    { label: "DuckDuckGo", needles: ["duckduckgo"] },
    { label: "Facebook", needles: ["facebook.", "l.facebook", "fb.com", "fb.me", "fb"] },
    { label: "Instagram", needles: ["instagram", "ig"] },
    { label: "X / Twitter", needles: ["t.co", "twitter", "x.com"] },
    { label: "LinkedIn", needles: ["linkedin", "lnkd.in"] },
    { label: "YouTube", needles: ["youtube", "youtu.be"] },
    { label: "Reddit", needles: ["reddit"] },
    { label: "Perplexity", needles: ["perplexity"] },
    { label: "ChatGPT", needles: ["chatgpt", "openai"] },
    { label: "Yelp", needles: ["yelp"] },
    { label: "Healthgrades", needles: ["healthgrades"] }
  ],
  directLabel: "Direct / none",
  articlePathPattern: "^/articles/([a-z0-9-]+)/?$",
  assetPathPattern: "^/(_astro|_image|images|img|audio|favicon|cdn-cgi|wp-cron|wp-admin|wp-login|xmlrpc|wp-content|wp-includes|.*\\.(?:css|js|png|jpe?g|webp|avif|svg|ico|mp3|xml|txt|php|woff2?))",
  botUaPattern: "bot|crawl|spider|slurp|bingpreview|facebookexternalhit|embedly|quora|pinterest|whatsapp|telegram|slack|discord|headless|monitor|uptime|python-requests|curl|wget|go-http|libwww|okhttp|axios|node-fetch|java\\/|scrapy|ahrefs|semrush|mj12|dotbot|petalbot|dataforseo|bytespider|gptbot|claudebot|ccbot|perplexity|yandex|baidu|sogou|applebot|googlebot|bingbot|duckduck",
  // Mirrors BoH `fetch-cf-analytics.mjs::SITE_ROUTE_404` (and strategy.ts). A
  // 404 on one of these survives the top-25 truncation.
  siteRoute404Patterns: [
    "^/articles/[a-z0-9-]+/?$",
    "^/conditions/[a-z0-9-]+/?$",
    "^/care/[a-z0-9-]+(/[a-z0-9-]+)?/?$",
    "^/team/[a-z0-9-]+/?$",
    "^/locations/[a-z0-9-]+/?$"
  ],
  cloudflare: {
    zoneId: "3729601f65f74d2f9d88d61d165fa1ac",
    accountId: "371ac4bfa6c0f9aa3b0de0228fb0952d",
    endpoint: "https://api.cloudflare.com/client/v4/graphql"
  },
  windowDays: 30,
  maxDailySnapshots: 365
};

// src/load.ts
import { existsSync } from "fs";
import { resolve } from "path";
import { pathToFileURL } from "url";
import { createJiti } from "jiti";
function validateDomainPack(input) {
  const parsed = domainPackSchema.safeParse(input);
  if (parsed.success) {
    return { ok: true, data: parsed.data, errors: [] };
  }
  return {
    ok: false,
    errors: parsed.error.issues.map((i) => ({
      path: i.path.join(".") || "(root)",
      message: i.message
    }))
  };
}
var CONFIG_CANDIDATES = ["jeldon.config.ts", "jeldon.config.mjs", "jeldon.config.js"];
function resolveConfigPath(cwd = process.cwd(), explicit) {
  if (explicit) {
    const p = resolve(cwd, explicit);
    return existsSync(p) ? p : null;
  }
  for (const name of CONFIG_CANDIDATES) {
    const p = resolve(cwd, name);
    if (existsSync(p)) return p;
  }
  return null;
}
async function loadDomainPack(opts = {}) {
  const cwd = opts.cwd ?? process.cwd();
  const configPath = resolveConfigPath(cwd, opts.path);
  if (!configPath) {
    throw new Error(
      `No Jeldon config found. Expected one of ${CONFIG_CANDIDATES.join(", ")} in ${cwd}.`
    );
  }
  const jiti = createJiti(pathToFileURL(cwd + "/").href);
  const mod = await jiti.import(configPath);
  const raw = mod?.default ?? mod;
  const result = validateDomainPack(raw);
  if (!result.ok || !result.data) {
    const lines = result.errors.map((e) => `  \u2022 ${e.path}: ${e.message}`).join("\n");
    throw new Error(`Invalid Domain Pack at ${configPath}:
${lines}`);
  }
  return result.data;
}
function defineDomainPack(pack) {
  return pack;
}
export {
  defaultAmplifyConfig,
  defaultAnalyticsConfig,
  defaultDraftingConfig,
  defaultEntityPresenceConfig,
  defaultGeoConfig,
  defaultMediaConfig,
  defaultScoringConfig,
  defaultSeoConfig,
  defaultStrategyConfig,
  defineDomainPack,
  domainPackSchema,
  loadDomainPack,
  resolveConfigPath,
  validateDomainPack
};
