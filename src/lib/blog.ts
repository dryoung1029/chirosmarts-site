/**
 * Blog — AI article generation (Article Studio).
 *
 * Drafts SEO blog articles for the chiropractic-assistant audience in Dr.
 * Young's voice (src/config/voice-profile.md). Owner-in-the-loop: drafts are
 * never auto-published. Compliance discipline carries over — the model must NOT
 * fabricate Oregon regulatory specifics/fees/figures; it keeps those general or
 * flags them [VERIFY] for the owner to confirm.
 *
 * Model: Claude Sonnet (quality matters; infrequent, admin-triggered).
 */
import Anthropic from "@anthropic-ai/sdk";
import voiceProfile from "@/config/voice-profile.md?raw";

const MODEL = "claude-sonnet-4-6";

export class NotConfiguredError extends Error {
  constructor() {
    super("ANTHROPIC_API_KEY is not set");
    this.name = "NotConfiguredError";
  }
}

export function slugify(s: string): string {
  return (
    s
      .toLowerCase()
      .replace(/['"]/g, "")
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 70) || "post"
  );
}

function firstH1(md: string): string | null {
  const m = md.match(/^\s*#\s+(.+?)\s*$/m);
  return m?.[1]?.trim() ?? null;
}

function firstParagraph(md: string): string {
  for (const block of md.split(/\n\s*\n/)) {
    const t = block.trim();
    if (!t || t.startsWith("#") || t.startsWith("-") || t.startsWith(">") || t.startsWith("|"))
      continue;
    return t.replace(/[*_`#>]/g, "").replace(/\s+/g, " ").trim();
  }
  return "";
}

/** Derive list/preview excerpt + SEO meta from a finished article body. */
export function deriveMeta(markdown: string): { excerpt: string; seoDescription: string } {
  const excerpt = firstParagraph(markdown).slice(0, 200);
  return { excerpt, seoDescription: excerpt.slice(0, 160) };
}

async function complete(
  env: CloudflareEnv,
  system: string,
  user: string,
  maxTokens = 4000,
): Promise<string> {
  const client = new Anthropic({ apiKey: env.ANTHROPIC_API_KEY! });
  const msg = await client.messages.create({
    model: MODEL,
    max_tokens: maxTokens,
    system,
    messages: [{ role: "user", content: user }],
  });
  return msg.content
    .filter((b): b is Anthropic.TextBlock => b.type === "text")
    .map((b) => b.text)
    .join("")
    .trim();
}

const SYSTEM = `You are writing an article for ChiroSmarts, an Oregon chiropractic-assistant (CA) training and compliance platform, in the author's voice below. The reader is a chiropractic assistant (or someone becoming one), and sometimes the clinic owner who employs them.

Your job: write something that ranks in Google AND is the source AI answer engines (Google AI Overviews, ChatGPT, Perplexity) quote. That means answer the query directly and early, structure for extraction, demonstrate first-hand expertise, and cite/link authoritative sources.

VOICE PROFILE
${voiceProfile}

AUTHOR AUTHORITY (draw on this naturally where relevant — never invent beyond it)
Jason Young, DC — practicing Oregon chiropractor since 2008; has trained Oregon CAs for 10+ years; former president of the Oregon Board of Chiropractic Examiners (OBCE), 2013–2019; first chiropractor in Oregon to offer online CA training. This first-hand regulatory + training experience is the article's credibility — show it where it fits, don't brag.

REQUIRED STRUCTURE (follow this skeleton exactly)
1. A single "# H1" title in natural language that includes the primary keyword and ideally reads like how a person would search or ask it.
2. Immediately after the H1, a DIRECT-ANSWER paragraph: 2–4 sentences (~40–60 words), wrapped in **bold**, that fully answers the title question on its own. AI engines extract this verbatim — it must stand alone with no setup.
3. "## Key takeaways" — 3–5 tight bullets.
4. 3–6 "## H2" sections. Phrase several as the literal questions a reader would ask. Lead each section with its answer in the first sentence, then explain. Use bullet or numbered lists where they aid scanning.
5. "## Frequently asked questions" — 3–6 entries, each a "### " question (the literal natural-language question) followed by a concise 1–3 sentence answer that stands alone.
6. "## Bottom line" — a 2–4 sentence wrap-up.
7. One light, non-salesy closing line pointing to ChiroSmarts training where it fits.

LINKING (REQUIRED — both internal and external)
- Internal: link 2–4 times to relevant ChiroSmarts pages using root-relative Markdown links. Available targets: /courses (catalog), /clinics (for clinic owners), /renewal (renewal CE + renewal-date checker), /verify (public certificate verification), /about (Dr. Young's background), and other /blog/ articles when relevant. Use descriptive anchor text (never "click here").
- External: link 1–3 times to authoritative primary sources — above all the Oregon Board of Chiropractic Examiners at https://www.oregon.gov/obce for anything regulatory, plus Oregon Administrative Rules / official .gov or board pages as relevant. These outbound trust signals matter; never invent a URL — if unsure of a deep link, link the OBCE homepage.

AEO RULES
- Answer first, elaborate second — in the intro AND in every section.
- Be specific and concrete (steps, real Oregon entities like the OBCE, numbers you are certain of). Specifics get cited; filler does not.
- Use the reader's vocabulary and real question phrasings.

COMPLIANCE
- Do NOT fabricate Oregon regulatory specifics, fees, hour requirements, or board rules. If a precise figure isn't certain, write generally ("check the current OAR / OBCE requirements") or flag it inline as [VERIFY]. A wrong regulatory claim is a brand and liability risk.
- No patient-directed clinical/medical advice — this is professional/educational content for CAs.

OUTPUT
- ~900–1400 words. Output GitHub-Flavored Markdown only — no preamble, no code fences around the whole article. Start with the H1.`;

export interface GeneratedArticle {
  title: string;
  slug: string;
  excerpt: string;
  seoDescription: string;
  markdown: string;
  model: string;
}

export async function generateArticle(
  env: CloudflareEnv,
  input: { topic: string; keywords?: string },
): Promise<GeneratedArticle> {
  if (!env.ANTHROPIC_API_KEY) throw new NotConfiguredError();
  const user = `Write the article on this topic: ${input.topic}${
    input.keywords ? `\n\nWork in these keywords/angles naturally: ${input.keywords}` : ""
  }`;
  const markdown = await complete(env, SYSTEM, user, 4500);
  const title = firstH1(markdown) ?? input.topic;
  const excerpt = firstParagraph(markdown).slice(0, 200);
  return {
    title,
    slug: slugify(title),
    excerpt,
    seoDescription: excerpt.slice(0, 160),
    markdown,
    model: MODEL,
  };
}

const REVISE_SYSTEM = `You are revising an existing ChiroSmarts blog article on the editor's instruction. Keep the author's voice and the SEO/AEO structure intact unless the instruction explicitly changes it: the bold direct-answer paragraph under the H1, "## Key takeaways", question-style H2 sections (answer-first), a "## Frequently asked questions" section with "### " questions, and "## Bottom line". Preserve and, where natural, strengthen internal links (/courses, /clinics, /renewal, /verify, /about, other /blog articles) and authoritative external links (the OBCE at https://www.oregon.gov/obce and other official .gov sources). Change only what the instruction asks. Same compliance rule: never fabricate Oregon regulatory specifics/fees — keep general or flag [VERIFY]. Return the COMPLETE revised article as GitHub-Flavored Markdown, starting with the H1. No commentary, no code fences.

VOICE PROFILE
${voiceProfile}`;

/**
 * Pull Q&A pairs out of a rendered article's "Frequently asked questions"
 * section (## heading, then ### question + answer paragraphs). Used to emit
 * FAQPage JSON-LD so the article is eligible for FAQ rich results / AI answers.
 * The Markdown stays the single source of truth — the owner just edits the body.
 */
export function extractFaqs(markdown: string): { q: string; a: string }[] {
  const lines = (markdown ?? "").split("\n");
  let i = lines.findIndex((l) => /^##\s+.*(faq|frequently asked)/i.test(l));
  if (i === -1) return [];
  const faqs: { q: string; a: string }[] = [];
  let q: string | null = null;
  let buf: string[] = [];
  const flush = () => {
    if (q) {
      const a = buf.join(" ").replace(/\s+/g, " ").trim();
      if (a) faqs.push({ q, a });
    }
    q = null;
    buf = [];
  };
  for (i = i + 1; i < lines.length; i++) {
    const line = lines[i];
    if (/^##\s+/.test(line)) break; // next H2 ends the FAQ section
    const h3 = line.match(/^###\s+(.+?)\s*$/);
    if (h3) {
      flush();
      q = h3[1].replace(/[*_`#]/g, "").trim();
      continue;
    }
    if (q) buf.push(line.replace(/[*_`>]/g, "").trim());
  }
  flush();
  return faqs.slice(0, 8);
}

/** Approximate word count of Markdown body, for Article schema. */
export function wordCount(markdown: string): number {
  return (markdown ?? "").replace(/[#>*_`\-|]/g, " ").split(/\s+/).filter(Boolean).length;
}

export async function reviseArticle(
  env: CloudflareEnv,
  currentMarkdown: string,
  instruction: string,
): Promise<{ markdown: string; model: string }> {
  if (!env.ANTHROPIC_API_KEY) throw new NotConfiguredError();
  const user = `INSTRUCTION:\n${instruction}\n\nCURRENT ARTICLE:\n${currentMarkdown}`;
  const markdown = await complete(env, REVISE_SYSTEM, user, 4500);
  return { markdown, model: MODEL };
}

const IMPROVE_SYSTEM = `You are an SEO + AEO editor improving a ChiroSmarts blog article so it scores perfectly on the checklist below, WITHOUT losing the author's voice, facts, or meaning. Rewrite/restructure as needed; keep everything that's already good.

VOICE PROFILE
${voiceProfile}

AUTHOR AUTHORITY (use where relevant; never invent beyond it)
Jason Young, DC — practicing Oregon chiropractor since 2008; trained Oregon CAs for 10+ years; former president of the Oregon Board of Chiropractic Examiners (OBCE), 2013–2019; first chiropractor in Oregon to offer online CA training.

CHECKLIST TO SATISFY (every item)
1. "# H1" natural-language title with the primary keyword.
2. Immediately under the H1, a bold (** **) DIRECT-ANSWER paragraph of 2–4 sentences (~40–60 words) that answers the title question standalone.
3. "## Key takeaways" with 3–5 bullets.
4. 3–6 "## H2" sections, several phrased as the reader's literal questions, each answer-first; use lists where they help.
5. "## Frequently asked questions" with 3–6 "### " question entries, each with a concise standalone 1–3 sentence answer.
6. "## Bottom line" wrap-up (2–4 sentences).
7. 2–4 INTERNAL links (root-relative Markdown) to relevant pages: /courses, /clinics, /renewal, /verify, /about, or other /blog articles — descriptive anchor text.
8. 1–3 EXTERNAL authority links to primary sources, above all the OBCE at https://www.oregon.gov/obce for regulatory points (never invent a URL).
9. ~900–1400 words.

COMPLIANCE: never fabricate Oregon regulatory specifics/fees/hours — keep general or flag [VERIFY]. No patient-directed clinical advice.

OUTPUT: the COMPLETE improved article as GitHub-Flavored Markdown, starting with the H1. No commentary, no code fences.`;

export async function improveArticle(
  env: CloudflareEnv,
  currentMarkdown: string,
): Promise<{ markdown: string; model: string }> {
  if (!env.ANTHROPIC_API_KEY) throw new NotConfiguredError();
  const markdown = await complete(env, IMPROVE_SYSTEM, `ARTICLE TO IMPROVE:\n${currentMarkdown}`, 4500);
  return { markdown, model: MODEL };
}

// ---- Hero image (two-step: prompt → image) -------------------------------

export class GeminiNotConfiguredError extends Error {
  constructor() {
    super("GEMINI_API_KEY is not set");
    this.name = "GeminiNotConfiguredError";
  }
}

/**
 * Site visual identity for hero art — kept in sync with the existing flat
 * editorial illustrations and brand tokens (src/styles/tokens.css). No text,
 * no logos: those are layered separately and image models render letters badly.
 */
const HERO_STYLE = `Flat, modern editorial vector illustration. Warm, clean, optimistic, professional — healthcare/chiropractic context in Oregon. Soft rounded shapes, subtle texture, gentle depth (no harsh gradients). Color palette: warm cream background (#FAFAF7), deep teal-green primary (#0b6b63) with a light teal tint (#ecf7f4), a warm terracotta accent (#c2410c) used sparingly, dark slate ink (#13272b). Wide 16:9 banner composition with generous negative space. Friendly and credible, not clip-art or corporate-stocky. ABSOLUTELY NO text, words, letters, numbers, logos, watermarks, or UI mockups.`;

const HERO_PROMPT_SYSTEM = `You write a single image-generation prompt for the hero banner of a ChiroSmarts blog article. Output ONLY the prompt text — one rich paragraph, no preamble, no quotes, no lists.

The image must match this house style exactly:
${HERO_STYLE}

Given the article's title and summary, describe a concrete, tasteful scene/metaphor that fits the topic (e.g. a friendly front-desk chiropractic assistant, a checklist/roadmap motif, a calm clinic reception, certification/learning imagery). Reaffirm the house style and the "no text/letters/logos, 16:9, cream background, generous negative space" constraints inside the prompt so the image model honors them.`;

export async function generateHeroPrompt(
  env: CloudflareEnv,
  input: { title: string; excerpt?: string },
): Promise<{ prompt: string; model: string }> {
  if (!env.ANTHROPIC_API_KEY) throw new NotConfiguredError();
  const user = `TITLE: ${input.title}${input.excerpt ? `\nSUMMARY: ${input.excerpt}` : ""}`;
  const prompt = await complete(env, HERO_PROMPT_SYSTEM, user, 600);
  return { prompt: prompt.replace(/^["'\s]+|["'\s]+$/g, ""), model: MODEL };
}

/**
 * Generate a hero image from a prompt via Google's Imagen (Gemini API).
 * Returns raw image bytes; the caller stores them in R2. Uses fetch (no SDK)
 * to keep the dependency surface minimal.
 */
export async function generateHeroImage(
  env: CloudflareEnv,
  prompt: string,
): Promise<{ bytes: Uint8Array; contentType: string; model: string }> {
  if (!env.GEMINI_API_KEY) throw new GeminiNotConfiguredError();
  const model = env.GEMINI_IMAGE_MODEL || "imagen-3.0-generate-002";
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:predict`;
  const res = await fetch(url, {
    method: "POST",
    headers: { "content-type": "application/json", "x-goog-api-key": env.GEMINI_API_KEY },
    body: JSON.stringify({
      instances: [{ prompt: `${prompt}\n\n${HERO_STYLE}` }],
      parameters: { sampleCount: 1, aspectRatio: "16:9", personGeneration: "allow_adult" },
    }),
  });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Imagen request failed (${res.status}): ${body.slice(0, 500)}`);
  }
  const data = (await res.json()) as {
    predictions?: { bytesBase64Encoded?: string; mimeType?: string }[];
  };
  const pred = data.predictions?.[0];
  if (!pred?.bytesBase64Encoded) {
    throw new Error("Imagen returned no image (the prompt may have been blocked by safety filters).");
  }
  const bin = atob(pred.bytesBase64Encoded);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return { bytes, contentType: pred.mimeType || "image/png", model };
}
