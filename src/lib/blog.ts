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

const SYSTEM = `You are writing an SEO blog article for ChiroSmarts, an Oregon chiropractic-assistant (CA) training and compliance platform, in the author's voice below. The reader is a chiropractic assistant (or someone becoming one), and sometimes the clinic owner who employs them.

VOICE PROFILE
${voiceProfile}

RULES
- COMPLIANCE: Do NOT fabricate Oregon regulatory specifics, fees, hour requirements, or board rules. If a precise figure isn't certain, write generally ("check the current OAR / OBCE requirements") or flag it inline as [VERIFY]. A wrong regulatory claim is a brand and liability risk.
- No patient-directed clinical/medical advice — this is professional/educational content for CAs.
- Structure: a single H1 title; a concrete opening hook (1–2 short paragraphs, no "in today's world" filler); 3–6 H2 sections with specific, useful content (lists where they help); a short "Bottom line" section; and one light, non-salesy closing nudge toward ChiroSmarts training where it fits naturally.
- Length ~700–1200 words. Output GitHub-Flavored Markdown only — no preamble, no code fences around the whole article. Start with the H1.`;

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

const REVISE_SYSTEM = `You are revising an existing ChiroSmarts blog article on the editor's instruction. Keep the author's voice and the structure; change only what the instruction asks. Same compliance rule: never fabricate Oregon regulatory specifics/fees — keep general or flag [VERIFY]. Return the COMPLETE revised article as GitHub-Flavored Markdown, starting with the H1. No commentary, no code fences.

VOICE PROFILE
${voiceProfile}`;

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
