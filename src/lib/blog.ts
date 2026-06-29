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
