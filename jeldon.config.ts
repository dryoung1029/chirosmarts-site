/**
 * ChiroSmarts Domain Pack — the ONE file that specializes the Jeldon engine for
 * this site. The @jeldon/* packages hardcode nothing about chiropractic, Oregon,
 * or this brand; every site-specific value lives here (Constitution Rule 1).
 *
 * Engine is consumed via vendored, pre-built packages under vendor/jeldon/*
 * (temporary bridge until @jeldon/* is published to GitHub Packages — then this
 * file is unchanged and only the install source flips).
 */
import { defineDomainPack, defaultSeoConfig } from "@jeldon/config";

const SITE = "https://chirosmarts-site.pages.dev"; // → chirosmarts.com at launch; SITE_URL is runtime truth

export default defineDomainPack({
  brand: {
    name: "ChiroSmarts",
    siteUrl: SITE,
    tagline: "Oregon CA training, exam, and verifiable certificate — tracked to audit standard.",
    geoFraming: "Oregon",
    nap: {
      // Online training business — registered agent address; no storefront/phone/placeId.
      address: "867 NW 23rd St",
      city: "Corvallis",
      region: "OR",
      postalCode: "97330",
    },
    logoUrl: "/logo.png",
    brandColors: { primary: "#0b6b63", accent: "#c2410c", ink: "#13272b", canvas: "#fafaf7" },
  },

  authors: [
    {
      slug: "jason-young",
      name: "Jason Young, DC",
      title: "Doctor of Chiropractic",
      schemaId: `${SITE}/about#jason-young`,
      isPrimary: true,
      profile: {
        name: "Jason Young, DC",
        jobTitle: "Doctor of Chiropractic",
        url: `${SITE}/about`,
        knowsAbout: [
          "Oregon chiropractic assistant certification",
          "Oregon Board of Chiropractic Examiners rules",
          "chiropractic compliance",
          "chiropractic assistant training",
          "clinic operations",
        ],
        credential:
          "Former president, Oregon Board of Chiropractic Examiners (2013–2019); practicing Oregon DC since 2008",
        memberOf: [
          "Oregon Board of Chiropractic Examiners",
          "National Board of Chiropractic Examiners",
        ],
        sameAs: [], // add confirmed profile URLs (LinkedIn, clinic) before relying on sameAs E-E-A-T
      },
    },
  ],

  voice: {
    persona:
      "A practicing Oregon chiropractor and former OBCE president teaching a motivated CA learner. Plain-spoken, direct, evidence-based, no hype. Authoritative but never condescending.",
    bannedTopics: ["patient-directed clinical/medical advice", "fabricated personal anecdotes"],
    bannedPhrasings: [
      "in today's fast-paced world",
      "comprehensive guide",
      "seamlessly",
      "studies have shown",
      "industry-leading",
      "in conclusion",
    ],
    rules: [
      "Accuracy over voice, always — never invent facts, figures, or regulatory claims.",
      "Never fabricate Oregon regulatory specifics/fees/hours; keep general or flag [VERIFY].",
      "Open with something concrete; answer the question first, explain second.",
      "Second-person address; outcome-focused for the CA, the patient, the exam, compliance.",
    ],
    voiceAnchorUrls: [
      "/blog/how-to-become-a-chiropractic-assistant-in-oregon",
      "/guides/become-a-chiropractic-assistant-oregon",
    ],
    readingGradeBand: [7, 10],
  },

  content: {
    categories: ["getting-started", "compliance", "front-desk", "renewal", "clinic-owners"],
    categoryTargets: {
      "getting-started": 78,
      compliance: 80,
      "front-desk": 74,
      renewal: 78,
      "clinic-owners": 76,
    },
    defaultAuthorSlug: "jason-young",
    timezone: "America/Los_Angeles",
    lifecycle: { docReviewed: true }, // maps the [VERIFY]-resolved review gate
  },

  scoring: {
    geo: {
      floor: 70, // <= lowest category target (74)
      checks: [
        {
          id: "directAnswer",
          label: "Bold direct-answer paragraph",
          weight: 18,
          kind: "regexCount",
          target: "body",
          patterns: ["\\*\\*[^*\\n]{40,}\\*\\*"],
          flags: "g",
          thresholds: [1, 1],
        },
        {
          id: "keyTakeaways",
          label: "Key takeaways section",
          weight: 12,
          kind: "regexCount",
          target: "body",
          patterns: ["^##\\s+key takeaways"],
          flags: "im",
          thresholds: [1, 1],
        },
        {
          id: "faq",
          label: "FAQ Q&A (rich results)",
          weight: 18,
          kind: "regexCount",
          target: "body",
          patterns: ["^###\\s+.+\\?"],
          flags: "gim",
          thresholds: [3, 1],
        },
        {
          id: "questionH2",
          label: "Question-style H2s",
          weight: 14,
          kind: "questionH2",
          patterns: ["what", "why", "how", "when", "should", "can", "do"],
          thresholds: [2, 1],
        },
        {
          id: "internalLinks",
          label: "Internal links",
          weight: 14,
          kind: "regexCount",
          target: "body",
          patterns: ["\\]\\(/(?!/)"],
          flags: "g",
          thresholds: [2, 1],
        },
        {
          id: "authority",
          label: "OBCE / .gov authority links",
          weight: 16,
          kind: "regexCount",
          target: "body",
          patterns: ["oregon\\.gov/obce", "oregon\\.gov", "\\.gov/"],
          flags: "gi",
          thresholds: [1, 1],
        },
        {
          id: "firstPerson",
          label: "First-person teaching markers",
          weight: 8,
          kind: "regexCount",
          target: "cleaned",
          patterns: ["I[\\u2019']ve trained|in my (?:practice|clinic)|when I (?:served|sat) on the board"],
          flags: "gi",
          thresholds: [1, 1],
        },
      ],
    },
    seo: {
      ...defaultSeoConfig,
      wordCount: { good: [900, 1400], mehMin: 700 },
      reading: { good: [7, 10], mehMax: 12 },
      internalLinkPrefixes: ["blog", "guides", "courses", "clinics", "renewal"],
      referenceSectionNames: ["frequently asked questions", "sources", "references"],
      evidenceTriggers: ["OBCE", "Oregon Administrative Rules", "certification", "seat time", "renewal"],
    },
  },

  citation: {
    policy: "direct-source-urls",
    forbiddenPatterns: ["OAR ?8{4,}"], // impossible OAR numbers — fabrication guard
    referenceFormat: "Title, source. [link](URL)",
    verifier: { kind: "primary-source" }, // resolvable .gov/OBCE links; NOT cite8/PubMed
  },

  aeo: {
    brandMentions: ["chirosmarts", "chiro smarts", "jason young"],
    localSearchLocation: "Oregon, United States",
    querySet: [
      { id: "become-ca-or", query: "how to become a chiropractic assistant in Oregon", tags: ["getting-started", "discovery"] },
      { id: "ca-cert-req", query: "Oregon chiropractic assistant certification requirements", tags: ["getting-started", "compliance"] },
      { id: "ca-training-online", query: "online chiropractic assistant training Oregon", tags: ["getting-started"] },
      { id: "ca-renewal", query: "Oregon chiropractic assistant renewal requirements", tags: ["renewal"] },
      { id: "ca-cost-time", query: "how long does it take to become a chiropractic assistant", tags: ["getting-started"] },
      { id: "hipaa-chiro-staff", query: "HIPAA training for chiropractic office staff", tags: ["compliance"] },
    ],
    engines: ["anthropic", "perplexity", "google-aio"],
    highPriorityTags: ["getting-started", "compliance"],
  },

  schema: {
    orgType: ["Organization"], // online training org; not LocalBusiness
    org: {
      name: "ChiroSmarts",
      url: SITE,
      logoUrl: `${SITE}/logo.png`,
      extra: {
        // address comes from brand.nap (structured PostalAddress); keep only
        // fields the engine doesn't already build, so extra never clobbers them.
        legalName: "Talisman Health Enterprise Management, LLC",
        email: "contact@chirosmarts.com",
      },
    },
    articleTypes: ["Article"], // NOT MedicalWebPage — professional/regulatory content, no PHI
    emitLlmsTxt: false,
  },

  compliance: {
    pack: "hipaa", // health context; drives the human-review gate (no PHI / no review-response surface)
    requireHumanReviewTags: ["VERIFY"], // maps the publish/schedule [VERIFY] gate
  },

  capabilities: {
    drafting: true,
    heroImages: true,
    engagementAnalytics: true,
    amplify: false, // Brevo groundwork only; flip on when wired
    competitiveIntel: false,
    audio: false,
    entityPresence: false,
  },

  services: {
    store: "fs", // blog persistence stays on D1 (engine store unused); fs = file-based content collections
    contentDir: "src/content/guides",
    analytics: "cloudflare",
    requiredEnv: ["SITE_URL", "ANTHROPIC_API_KEY", "GEMINI_API_KEY", "PERPLEXITY_API_KEY"],
  },
});
