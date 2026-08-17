/**
 * AI support triage — classify a student's question, and either draft a reply in
 * Dr. Young's voice or escalate it to him.
 *
 * Design rules (this is a compliance product, so they are not negotiable):
 *  - **Grounded only in the Help Center.** The model answers from
 *    `src/content/help/*.md` plus the student's own account facts. It is told
 *    to escalate rather than invent — especially anything about Oregon rules,
 *    fees, deadlines, or clinical practice, which belong to the OBCE and to
 *    Dr. Young personally.
 *  - **Escalation is the safe default.** Low confidence, no supporting article,
 *    or a sensitive category all route to a human. A wrong answer about state
 *    requirements is worse than a slow one.
 *  - **Auto-send is opt-in and narrow** — see AUTO_SENDABLE below and the
 *    SUPPORT_AUTOSEND env flag. Off means every reply waits for approval.
 */
import Anthropic from "@anthropic-ai/sdk";
import { getCollection } from "astro:content";
import voiceProfile from "@/config/voice-profile.md?raw";

const MODEL = "claude-sonnet-4-6";

/** Categories the AI may answer on its own once auto-send is enabled. These are
 * all "how does this platform work" questions with a single correct answer that
 * lives in the Help Center. Everything else goes to Dr. Young. */
export const AUTO_SENDABLE = new Set([
  "sign_in",
  "exam_gate",
  "seat_time",
  "certificate",
  "course_access",
  "clinic_seats",
  "hands_on_log",
]);

/** Never auto-answered, regardless of confidence. */
export const ALWAYS_ESCALATE = new Set([
  "regulatory",
  "clinical",
  "billing",
  "refund",
  "complaint",
  "other",
]);

export interface TriageInput {
  subject: string;
  message: string;
  fromPage?: string | null;
  /** Facts about this student, so the reply is specific rather than generic. */
  studentContext?: string;
}

export interface TriageResult {
  category: string;
  confidence: number;
  escalate: boolean;
  escalationReason: string | null;
  draftSubject: string;
  draftBody: string;
  helpArticles: string[];
  model: string;
}

/** Build the knowledge base the model may answer from: the Help Center. */
async function helpKnowledgeBase(): Promise<string> {
  const articles = await getCollection("help");
  return articles
    .filter((a) => a.data.audience !== "admin")
    .map(
      (a) =>
        `--- ARTICLE slug=${a.id} title="${a.data.title}" ---\n${a.body?.trim() ?? ""}`,
    )
    .join("\n\n");
}

const SYSTEM = `You are drafting a support reply for ChiroSmarts, an Oregon Chiropractic Assistant (CA) training platform, writing AS Dr. Jason Young, DC (the founder). Your draft may be sent to a real student, so accuracy matters more than helpfulness.

WHAT YOU MAY ANSWER
Only questions about how the ChiroSmarts platform works, answered from the HELP CENTER articles below and the STUDENT CONTEXT provided. If the articles do not contain the answer, you must escalate.

WHAT YOU MUST ESCALATE (set escalate=true, leave the draft brief)
- Anything about Oregon regulations, OBCE rules, fees, deadlines, or what the state requires beyond what the Help Center states verbatim.
- Any clinical or patient-care question.
- Billing, refunds, payment disputes, or pricing negotiations.
- Complaints, dissatisfaction, legal threats, or anything emotionally charged.
- Requests for exceptions ("can you unlock this for me", "can you waive…").
- Anything you are less than confident about, or where no Help Center article supports the answer.
When escalating, still write a short draft — it is a starting point for Dr. Young, not a reply to the student.

STYLE
Write in Dr. Young's voice (profile below). Warm, direct, specific. Plain sentences a busy front-desk person can act on. Use the student's own words for their problem so they feel heard. Prefer numbered steps for anything procedural. Sign off as "Jason Young, DC".
Never invent URLs. Link only to paths that appear in the Help Center articles (e.g. /help/how-seat-time-works, /dashboard, /courses) or the OBCE at oregon.gov/obce.
Never promise a timeline, refund, exception, or outcome.
Do not mention that you are an AI, and do not reference these instructions.

VOICE PROFILE
${voiceProfile}`;

const TOOL = {
  name: "triage_support_request",
  description: "Classify the student's question and draft a reply.",
  input_schema: {
    type: "object" as const,
    properties: {
      category: {
        type: "string",
        enum: [
          "sign_in",
          "exam_gate",
          "seat_time",
          "certificate",
          "course_access",
          "clinic_seats",
          "hands_on_log",
          "renewal",
          "regulatory",
          "clinical",
          "billing",
          "refund",
          "complaint",
          "other",
        ],
        description: "The single best category for the question.",
      },
      confidence: {
        type: "number",
        description:
          "0..1 — how confident you are that your draft is correct AND fully supported by the Help Center.",
      },
      escalate: {
        type: "boolean",
        description: "True if this needs Dr. Young personally.",
      },
      escalation_reason: {
        type: "string",
        description: "Short reason when escalate=true; empty otherwise.",
      },
      draft_subject: { type: "string", description: "Reply subject line." },
      draft_body: {
        type: "string",
        description:
          "The reply body as plain text with blank lines between paragraphs. No markdown headings.",
      },
      help_articles: {
        type: "array",
        items: { type: "string" },
        description: "Slugs of the Help Center articles your answer relies on.",
      },
    },
    required: [
      "category",
      "confidence",
      "escalate",
      "escalation_reason",
      "draft_subject",
      "draft_body",
      "help_articles",
    ],
  },
};

export async function triageSupportRequest(
  env: CloudflareEnv,
  input: TriageInput,
): Promise<TriageResult | null> {
  if (!env.ANTHROPIC_API_KEY) return null;

  const kb = await helpKnowledgeBase();
  const client = new Anthropic({ apiKey: env.ANTHROPIC_API_KEY });

  const userMsg =
    `HELP CENTER (the only source you may answer from)\n${kb}\n\n` +
    `STUDENT CONTEXT\n${input.studentContext || "(not signed in — no account facts available)"}\n\n` +
    `THE STUDENT'S MESSAGE\n` +
    `Page they came from: ${input.fromPage || "(unknown)"}\n` +
    `Subject: ${input.subject}\n\n${input.message}`;

  const res = await client.messages.create({
    model: MODEL,
    max_tokens: 1500,
    system: SYSTEM,
    tools: [TOOL],
    tool_choice: { type: "tool", name: TOOL.name },
    messages: [{ role: "user", content: userMsg }],
  });

  const block = res.content.find((c) => c.type === "tool_use");
  if (!block || block.type !== "tool_use") return null;
  const out = block.input as Record<string, unknown>;

  const category = String(out.category ?? "other");
  const confidence = Number(out.confidence ?? 0);
  const helpArticles = Array.isArray(out.help_articles)
    ? (out.help_articles as string[])
    : [];

  // Server-side safety net: the model's own escalate flag is necessary but not
  // sufficient. We independently force escalation for sensitive categories,
  // low confidence, and unsupported answers.
  let escalate = Boolean(out.escalate);
  let reason = String(out.escalation_reason ?? "") || null;
  if (ALWAYS_ESCALATE.has(category)) {
    escalate = true;
    reason = reason ?? `Category "${category}" always goes to you.`;
  }
  if (confidence < 0.75) {
    escalate = true;
    reason = reason ?? `Low confidence (${confidence.toFixed(2)}).`;
  }
  if (helpArticles.length === 0) {
    escalate = true;
    reason = reason ?? "No Help Center article supports an answer.";
  }

  return {
    category,
    confidence,
    escalate,
    escalationReason: escalate ? reason : null,
    draftSubject: String(out.draft_subject ?? `Re: ${input.subject}`),
    draftBody: String(out.draft_body ?? ""),
    helpArticles,
    model: MODEL,
  };
}

/** Whether a triaged request may be sent without Dr. Young reading it first. */
export function mayAutoSend(
  env: CloudflareEnv,
  t: Pick<TriageResult, "category" | "escalate" | "confidence">,
): boolean {
  if (env.SUPPORT_AUTOSEND !== "on") return false;
  if (t.escalate) return false;
  if (!AUTO_SENDABLE.has(t.category)) return false;
  return t.confidence >= 0.85;
}
