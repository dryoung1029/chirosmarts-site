// src/voice.ts
function buildVoiceBlock(pack) {
  const { voice, brand } = pack;
  const lines = ["Voice for everything you write:"];
  lines.push(`- ${voice.persona}`);
  for (const rule of voice.rules) lines.push(`- ${rule}`);
  if (voice.bannedTopics.length) {
    lines.push(`- Never: ${voice.bannedTopics.join("; ")}.`);
  }
  if (voice.bannedPhrasings.length) {
    lines.push(`- Avoid these phrasings: ${voice.bannedPhrasings.join("; ")}.`);
  }
  if (brand.geoFraming) {
    lines.push(`- Default geographic framing: "${brand.geoFraming}".`);
  }
  if (voice.voiceAnchorUrls.length) {
    lines.push(`- Tonal references (match this register): ${voice.voiceAnchorUrls.join(", ")}.`);
  }
  const [lo, hi] = voice.readingGradeBand;
  lines.push(`- Reading level: target Flesch-Kincaid grade ${lo}-${hi} in body copy.`);
  return lines.join("\n");
}

// src/kit.ts
import { defaultAmplifyConfig } from "@jeldon/config";
function resolveAmplify(pack) {
  return pack.amplify ?? defaultAmplifyConfig;
}
function buildKitSystem(pack) {
  const amplify = resolveAmplify(pack);
  const voiceBlock = buildVoiceBlock(pack);
  const channelGuidance = amplify.channels.map((c) => c.guidance).join("\n\n");
  return `${amplify.systemPreamble}

${voiceBlock}

Channel-specific guidance:

${channelGuidance}`;
}
function buildFullKitTool(channels) {
  const properties = {};
  const required = [];
  for (const c of channels) {
    properties[c.id] = { type: "string", description: c.fieldDescription };
    required.push(c.id);
  }
  return {
    name: "generate_amplification",
    description: "Produce distribution copy for every channel.",
    input_schema: { type: "object", properties, required }
  };
}
var SINGLE_TOOL = {
  name: "regenerate_channel",
  description: "Produce a fresh version of one channel's copy.",
  input_schema: {
    type: "object",
    properties: {
      text: {
        type: "string",
        description: "The new copy for the requested channel. Must follow that channel's rules from the system prompt."
      }
    },
    required: ["text"]
  }
};
function articleBlock(article, url) {
  const tags = (article.tags ?? []).join(", ");
  return `Title: ${article.title}
URL: ${url}
${article.isDraft ? "NOTE: This article is still a draft. The URL above will 404 until it goes live. Generate the copy anyway \u2014 this is a preview." : ""}
Category: ${article.category ?? ""}
Tags: ${tags}

<article>
${article.body}
</article>`;
}
function articleUrl(siteUrl, slug) {
  return `${siteUrl.replace(/\/$/, "")}/articles/${slug}`;
}
function tagUrl(text, url, utm, slug) {
  if (!utm) return text;
  const tagged = `${url}?${utm}&utm_campaign=${encodeURIComponent(slug)}`;
  const escaped = url.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return text.replace(new RegExp(escaped + "/?(?!\\?)", "g"), tagged);
}
async function generateKit(article, pack, llm, opts = {}) {
  const amplify = resolveAmplify(pack);
  const url = articleUrl(pack.brand.siteUrl, article.slug);
  const tool = buildFullKitTool(amplify.channels);
  const res = await llm.callTool({
    model: opts.model ?? "sonnet",
    maxTokens: opts.maxTokens ?? 4e3,
    system: buildKitSystem(pack),
    tool,
    userMessage: `${articleBlock(article, url)}

Generate the full amplification kit. Use the URL above wherever a channel needs it (skip for channels whose rules say "link in bio").`
  });
  if (!res.input) {
    throw new Error(
      res.stopReason === "max_tokens" ? "Model ran out of output tokens. Try again or switch models." : `Model returned no copy (stop_reason: ${res.stopReason}).`
    );
  }
  const kit = {};
  for (const c of amplify.channels) {
    const raw = res.input[c.id];
    if (typeof raw !== "string") continue;
    kit[c.id] = c.noUrl ? raw : tagUrl(raw, url, c.utm, article.slug);
  }
  return {
    kit,
    meta: { url, title: article.title, isDraft: !!article.isDraft },
    model: opts.model ?? "sonnet",
    usage: res.usage
  };
}
async function regenerateChannel(article, channelId, pack, llm, opts = {}) {
  const amplify = resolveAmplify(pack);
  const channel = amplify.channels.find((c) => c.id === channelId);
  if (!channel) throw new Error(`Unknown channel "${channelId}"`);
  const url = articleUrl(pack.brand.siteUrl, article.slug);
  const refinementBlock = opts.refinement?.trim() ? `

USER REFINEMENT REQUEST: ${opts.refinement.trim()}

Apply this refinement to the new version. If it contradicts the channel's hard rules (e.g. asking to exceed a character limit), honor the rule and note the conflict at the end.` : "";
  const previousBlock = opts.currentText?.trim() ? `

<previous_version>
${opts.currentText}
</previous_version>

Produce a DIFFERENT version \u2014 don't return the same text. Vary the angle, the hook, the structure, or the emphasis.` : "";
  const res = await llm.callTool({
    model: opts.model ?? "sonnet",
    maxTokens: opts.maxTokens ?? 1500,
    system: buildKitSystem(pack),
    tool: SINGLE_TOOL,
    userMessage: `${articleBlock(article, url)}${previousBlock}${refinementBlock}

Produce ONLY the ${channel.label}. Call regenerate_channel with the new text. Follow all the rules for this channel from the system prompt.`
  });
  if (!res.input || typeof res.input.text !== "string") {
    throw new Error(
      res.stopReason === "max_tokens" ? "Model ran out of output tokens. Try again or switch models." : `Model returned no copy (stop_reason: ${res.stopReason}).`
    );
  }
  const text = channel.noUrl ? res.input.text : tagUrl(res.input.text, url, channel.utm, article.slug);
  return {
    channel: channelId,
    text,
    meta: { url, title: article.title, isDraft: !!article.isDraft },
    model: opts.model ?? "sonnet",
    usage: res.usage
  };
}

// src/carousel.ts
import { defaultAmplifyConfig as defaultAmplifyConfig2 } from "@jeldon/config";
function resolveAmplify2(pack) {
  return pack.amplify ?? defaultAmplifyConfig2;
}
function buildCarouselSystem(pack) {
  const amplify = resolveAmplify2(pack);
  return `${buildVoiceBlock(pack)}

${amplify.carouselGuidance}`;
}
function buildCarouselTool(schemes) {
  return {
    name: "design_carousel",
    description: "Design a 5-7 slide carousel (text slides only \u2014 the hero slide is appended by the system with a user-selected CTA).",
    input_schema: {
      type: "object",
      properties: {
        schemeName: {
          type: "string",
          enum: schemes.map((s) => s.id),
          description: "One of the predefined color schemes. Pick the one that fits the article energy unless the user overrode."
        },
        slides: {
          type: "array",
          minItems: 5,
          maxItems: 7,
          items: {
            type: "object",
            properties: {
              kicker: {
                type: "string",
                description: 'Optional small label above body. e.g. "1/5", "THE MYTH", "BOTTOM LINE". Use sparingly.'
              },
              body: {
                type: "string",
                description: "The big centered text. 4-14 words. Headline energy."
              },
              footer: {
                type: "string",
                description: "Optional small label below body. Rarely used. Source attribution or small subtitle."
              }
            },
            required: ["body"]
          }
        }
      },
      required: ["schemeName", "slides"]
    }
  };
}
async function generateCarousel(article, pack, llm, opts = {}) {
  const amplify = resolveAmplify2(pack);
  const schemes = amplify.carouselSchemes;
  const byId = new Map(schemes.map((s) => [s.id, s]));
  const override = opts.schemeOverride && byId.has(opts.schemeOverride) ? opts.schemeOverride : void 0;
  const overrideBlock = override ? `

USER OVERRIDE: use the color scheme "${override}" (${byId.get(override).label}) regardless of which scheme would naturally fit.` : "";
  const isIteration = !!opts.refinement?.trim() && Array.isArray(opts.currentSlides) && opts.currentSlides.length > 0;
  const currentBlock = isIteration ? `

<current_carousel>
${opts.currentSlides.map(
    (s, i) => `Slide ${i + 1}: kicker=${JSON.stringify(s.kicker ?? "")}, body=${JSON.stringify(
      s.body ?? ""
    )}, footer=${JSON.stringify(s.footer ?? "")}`
  ).join("\n")}
</current_carousel>

The user is ITERATING on the carousel above \u2014 not starting fresh. Preserve every slide and field exactly unless the refinement below requires the change.` : "";
  const refinementBlock = opts.refinement?.trim() ? `

USER REFINEMENT: ${opts.refinement.trim()}` : "";
  const taskLine = isIteration ? "Apply the refinement. Return ALL slides \u2014 unchanged slides should come back verbatim." : "5-7 text slides plus the hero (added by system). Hook on slide 1, payoff on the last text slide. Pick a color scheme that matches the energy, unless overridden above.";
  const userMessage = `Article slug: ${article.slug}
Title: ${article.title}
Excerpt: ${article.excerpt ?? ""}

<article>
${article.body}
</article>${overrideBlock}${currentBlock}${refinementBlock}

${taskLine}`;
  const res = await llm.callTool({
    model: opts.model ?? "sonnet",
    maxTokens: opts.maxTokens ?? 2500,
    system: buildCarouselSystem(pack),
    tool: buildCarouselTool(schemes),
    userMessage
  });
  if (!res.input) {
    throw new Error(`Model returned no carousel (stop_reason: ${res.stopReason}).`);
  }
  const fallback = schemes[0];
  const chosenId = override ?? res.input.schemeName;
  const scheme = byId.get(chosenId) ?? fallback;
  const slides = Array.isArray(res.input.slides) ? res.input.slides : [];
  const siteUrl = pack.brand.siteUrl.replace(/\/$/, "");
  return {
    schemeId: scheme.id,
    scheme,
    schemes,
    slides,
    heroImage: article.heroImage ?? null,
    heroImageAlt: article.heroImageAlt ?? null,
    title: article.title,
    slug: article.slug,
    articleUrl: `${siteUrl}/articles/${article.slug}/`,
    model: opts.model ?? "sonnet",
    usage: res.usage
  };
}

// src/carousel-store.ts
import { defaultAmplifyConfig as defaultAmplifyConfig3 } from "@jeldon/config";
function resolveStateDir(pack) {
  const amplify = pack.amplify ?? defaultAmplifyConfig3;
  return (amplify.carouselStateDir ?? "src/data/carousel-state").replace(/\/$/, "");
}
var CarouselSidecarStore = class {
  constructor(store, pack) {
    this.store = store;
    this.dir = resolveStateDir(pack);
  }
  store;
  dir;
  path(slug) {
    return `${this.dir}/${slug}.json`;
  }
  /** Read the sidecar for a slug. Returns `{ state: null, sha: null }` when
   *  none exists (the article was never carousel-customized). */
  async get(slug) {
    const file = await this.store.getDataFile(this.path(slug));
    if (!file) return { state: null, sha: null };
    try {
      return { state: JSON.parse(file.content), sha: file.sha };
    } catch {
      return { state: null, sha: file.sha };
    }
  }
  /**
   * Persist a sidecar. Stamps `updatedAt`, keeps only the visual fields, and
   * relies on the Store's conflict recovery. Pass the `sha` you read for
   * optimistic concurrency; `null` resolves the current sha first (the BoH PUT
   * behaviour where a missing sha is looked up before commit).
   */
  async put(slug, state, sha = null) {
    if (!Array.isArray(state.slides)) {
      throw new Error("Invalid carousel sidecar: `slides` must be an array.");
    }
    const next = {
      slides: state.slides,
      hero: state.hero,
      backdrop: state.backdrop,
      updatedAt: (/* @__PURE__ */ new Date()).toISOString()
    };
    const content = JSON.stringify(next, null, 2) + "\n";
    const path = this.path(slug);
    let resolvedSha = sha;
    if (resolvedSha === null) {
      const existing = await this.store.getDataFile(path);
      resolvedSha = existing?.sha ?? null;
    }
    const result = await this.store.saveDataFile(
      path,
      content,
      resolvedSha,
      `carousel: update sidecar state for ${slug}`
    );
    return { sha: result.sha, mergedFromConflict: result.mergedFromConflict };
  }
};

// src/newsletter.ts
import { defaultAmplifyConfig as defaultAmplifyConfig4 } from "@jeldon/config";
var NEWSLETTER_TOOL = {
  name: "compose_newsletter",
  description: "Produce the subject + body for the newsletter blast.",
  input_schema: {
    type: "object",
    properties: {
      subject: {
        type: "string",
        description: "Email subject line. 40-60 chars. No URLs, no emoji unless earned."
      },
      body: {
        type: "string",
        description: "Email body. 80-130 words. Personal-note tone. NO URL \u2014 the email template handles the CTA button."
      }
    },
    required: ["subject", "body"]
  }
};
function resolveAmplify3(pack) {
  return pack.amplify ?? defaultAmplifyConfig4;
}
function buildNewsletterSystem(pack) {
  const amplify = resolveAmplify3(pack);
  return `${buildVoiceBlock(pack)}

${amplify.newsletterGuidance}`;
}
async function generateNewsletter(article, pack, llm, opts = {}) {
  const limit = opts.bodyCharLimit ?? 12e3;
  const articleBlock2 = `Title: ${article.title}
Excerpt: ${article.excerpt ?? ""}
Category: ${article.category ?? ""}
Tags: ${(article.tags ?? []).join(", ")}

<article>
${article.body.slice(0, limit)}
</article>`;
  const res = await llm.callTool({
    model: opts.model ?? "sonnet",
    maxTokens: opts.maxTokens ?? 1024,
    system: buildNewsletterSystem(pack),
    tool: NEWSLETTER_TOOL,
    userMessage: `Compose the newsletter for this article.

${articleBlock2}`
  });
  if (!res.input || typeof res.input.subject !== "string" || typeof res.input.body !== "string") {
    throw new Error("Model returned no compose_newsletter tool_use block.");
  }
  return { subject: res.input.subject, body: res.input.body };
}

// src/brevo.ts
var BREVO_URL = "https://api.brevo.com/v3";
function toPositiveInt(v) {
  const n = typeof v === "string" ? Number(v) : v;
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : null;
}
function nonEmpty(v) {
  if (typeof v !== "string") return null;
  const t = v.trim();
  return t.length > 0 ? t : null;
}
function resolveBrevoConfig(opts) {
  const { stored, env } = opts;
  const apiKey = env.BREVO_API_KEY;
  if (!apiKey) throw new Error("BREVO_API_KEY is not set in the runtime environment.");
  const listId = toPositiveInt(stored?.listId) ?? toPositiveInt(env.BREVO_LIST_ID) ?? 0;
  const templateId = toPositiveInt(stored?.templateId) ?? toPositiveInt(env.BREVO_NEWSLETTER_TEMPLATE_ID) ?? 0;
  const senderName = nonEmpty(stored?.senderName) ?? nonEmpty(env.BREVO_SENDER_NAME) ?? opts.defaultSenderName ?? "";
  const senderEmail = nonEmpty(stored?.senderEmail) ?? nonEmpty(env.BREVO_SENDER_EMAIL) ?? "";
  if (!listId || !templateId || !senderEmail) {
    const missing = [];
    if (!listId) missing.push("listId");
    if (!templateId) missing.push("templateId");
    if (!senderEmail) missing.push("senderEmail");
    throw new Error(
      `Brevo config is incomplete (missing: ${missing.join(", ")}). Set values via the admin settings, or populate BREVO_LIST_ID / BREVO_NEWSLETTER_TEMPLATE_ID / BREVO_SENDER_EMAIL in the environment.`
    );
  }
  return {
    apiKey,
    listId,
    templateId,
    senderName,
    senderEmail,
    updatedAt: stored?.updatedAt ?? null
  };
}
function resolveBrevoListId(stored, env) {
  if (!env.BREVO_API_KEY) return null;
  return toPositiveInt(stored?.listId) ?? toPositiveInt(env.BREVO_LIST_ID) ?? null;
}
var BrevoClient = class {
  constructor(config) {
    this.config = config;
  }
  config;
  /** Schedule a campaign against the configured list + template. */
  async createScheduledCampaign(args) {
    const res = await fetch(`${BREVO_URL}/emailCampaigns`, {
      method: "POST",
      headers: {
        "api-key": this.config.apiKey,
        "Content-Type": "application/json",
        Accept: "application/json"
      },
      body: JSON.stringify({
        name: args.name,
        subject: args.subject,
        sender: { name: this.config.senderName, email: this.config.senderEmail },
        templateId: this.config.templateId,
        params: args.params,
        recipients: { listIds: [this.config.listId] },
        scheduledAt: args.scheduledAt.toISOString()
      })
    });
    if (!res.ok) throw new Error(`Brevo create ${res.status}: ${await res.text()}`);
    const data = await res.json();
    return { campaignId: data.id };
  }
  /**
   * Cancel a scheduled campaign. Brevo has no hard delete for a scheduled-
   * but-unsent campaign — "suspended" is the kill state.
   */
  async cancel(campaignId) {
    const res = await fetch(`${BREVO_URL}/emailCampaigns/${campaignId}/status`, {
      method: "PUT",
      headers: {
        "api-key": this.config.apiKey,
        "Content-Type": "application/json",
        Accept: "application/json"
      },
      body: JSON.stringify({ status: "suspended" })
    });
    if (!res.ok) throw new Error(`Brevo cancel ${res.status}: ${await res.text()}`);
  }
  /** Fire a campaign immediately. */
  async sendNow(campaignId) {
    const res = await fetch(`${BREVO_URL}/emailCampaigns/${campaignId}/sendNow`, {
      method: "POST",
      headers: { "api-key": this.config.apiKey, Accept: "application/json" }
    });
    if (!res.ok) throw new Error(`Brevo sendNow ${res.status}: ${await res.text()}`);
  }
  /**
   * Send timing: prefer the next `hour`:00 in `timezone`, with a `floorHours`
   * floor from `now` so a same-hour publish doesn't blast immediately. Pure +
   * static so it's unit-testable without a client. Ported verbatim from
   * `brevo-campaigns.ts::nextSendSlot` (timezone + hour were `America/
   * Los_Angeles` / 10 literals).
   */
  static nextSendSlot(now, timezone = "America/Los_Angeles", hour = 10, floorHours = 4) {
    const earliest = new Date(now.getTime() + floorHours * 60 * 60 * 1e3);
    const todayLocal = new Intl.DateTimeFormat("en-CA", {
      timeZone: timezone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit"
    }).format(now);
    const hh = String(hour).padStart(2, "0");
    let target = /* @__PURE__ */ new Date(`${todayLocal}T${hh}:00:00-08:00`);
    for (let i = 0; i < 2; i++) {
      const hourInTz = Number(
        new Intl.DateTimeFormat("en-US", {
          timeZone: timezone,
          hour: "2-digit",
          hour12: false
        }).format(target)
      );
      if (hourInTz === hour) break;
      target = new Date(target.getTime() + (hour - hourInTz) * 60 * 60 * 1e3);
    }
    if (target.getTime() < earliest.getTime()) {
      target = new Date(target.getTime() + 24 * 60 * 60 * 1e3);
      if (target.getTime() < earliest.getTime()) target = earliest;
    }
    return target;
  }
};

// src/llm.ts
var ANTHROPIC_URL = "https://api.anthropic.com/v1/messages";
var MODEL_ALIASES = {
  sonnet: "claude-sonnet-4-6",
  opus: "claude-opus-4-7",
  haiku: "claude-haiku-4-5"
};
function resolveModel(model, fallback = "sonnet") {
  const m = model ?? fallback;
  return MODEL_ALIASES[m] ?? m;
}
var AnthropicLlmClient = class {
  apiKey;
  url;
  version;
  constructor(opts) {
    if (!opts.apiKey) throw new Error("AnthropicLlmClient requires an apiKey.");
    this.apiKey = opts.apiKey;
    this.url = opts.baseUrl ?? ANTHROPIC_URL;
    this.version = opts.anthropicVersion ?? "2023-06-01";
  }
  async callTool(req) {
    const res = await fetch(this.url, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-api-key": this.apiKey,
        "anthropic-version": this.version
      },
      body: JSON.stringify({
        model: resolveModel(req.model),
        max_tokens: req.maxTokens,
        system: req.system,
        tools: [req.tool],
        tool_choice: { type: "tool", name: req.tool.name },
        messages: [{ role: "user", content: req.userMessage }]
      })
    });
    if (!res.ok) {
      throw new Error(`Anthropic ${res.status}: ${(await res.text()).slice(0, 400)}`);
    }
    const data = await res.json();
    const toolUse = data.content.find(
      (b) => b.type === "tool_use" && b.name === req.tool.name
    );
    return {
      input: toolUse?.input ?? null,
      stopReason: data.stop_reason,
      usage: data.usage
    };
  }
};
export {
  AnthropicLlmClient,
  BrevoClient,
  CarouselSidecarStore,
  buildKitSystem,
  buildNewsletterSystem,
  buildVoiceBlock,
  generateCarousel,
  generateKit,
  generateNewsletter,
  regenerateChannel,
  resolveBrevoConfig,
  resolveBrevoListId,
  resolveModel
};
