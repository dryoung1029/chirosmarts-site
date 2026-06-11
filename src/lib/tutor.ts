/**
 * M6 — AI course tutor.
 *
 * Answers student questions grounded ONLY in `lesson_transcripts`, cites the
 * lesson + timestamp (with deep links into the player), and declines anything
 * outside the course material — including clinical/medical advice. Retrieval is
 * a lightweight keyword match over the transcript chunks the student is actually
 * entitled to see (free-preview modules for non-enrolled users; all modules once
 * enrolled), so the tutor never leaks paid content past the paywall.
 *
 * Model: Claude Haiku 4.5 (grounded Q&A at this scale; see PLAN.md M6).
 */
import Anthropic from "@anthropic-ai/sdk";
import { and, eq, inArray, or, like } from "drizzle-orm";
import type { Db } from "@/db/client";
import { schema } from "@/db/client";

const MODEL = "claude-haiku-4-5";
const MAX_SOURCES = 12;
const MAX_CANDIDATES = 400;

const STOPWORDS = new Set([
  "the", "and", "for", "are", "was", "were", "that", "this", "with", "you",
  "your", "from", "what", "when", "where", "which", "how", "why", "who", "can",
  "does", "did", "has", "have", "had", "about", "into", "out", "not", "but",
  "all", "any", "our", "they", "them", "their", "its", "his", "her", "she",
  "him", "get", "got", "use", "used", "using", "should", "would", "could",
  "there", "here", "than", "then", "also", "may", "might", "must",
]);

export interface RetrievedChunk {
  lessonId: string;
  moduleId: string;
  lessonTitle: string;
  startSeconds: number;
  endSeconds: number;
  text: string;
}

export interface Citation {
  n: number;
  lessonTitle: string;
  timestamp: string; // MM:SS
  href: string; // deep link into the player at the timestamp
}

export interface TutorResult {
  answer: string;
  citations: Citation[];
}

/** Split a question into distinct, meaningful keywords (alphanumeric only). */
export function tokenize(q: string): string[] {
  const seen = new Set<string>();
  for (const raw of q.toLowerCase().split(/[^a-z0-9]+/)) {
    if (raw.length < 3 || STOPWORDS.has(raw)) continue;
    seen.add(raw);
  }
  return [...seen].slice(0, 12);
}

function fmtTimestamp(seconds: number): string {
  const s = Math.max(0, Math.floor(seconds));
  const m = Math.floor(s / 60);
  const ss = (s % 60).toString().padStart(2, "0");
  return `${m}:${ss}`;
}

/**
 * Keyword-retrieve the most relevant transcript chunks the student may see.
 * `allowedLessonIds` is the entitlement gate — pass only lessons in modules the
 * user can access. Returns [] when nothing matches (caller declines gracefully).
 */
export async function retrieveChunks(
  db: Db,
  courseId: string,
  allowedLessonIds: string[],
  question: string,
): Promise<RetrievedChunk[]> {
  const keywords = tokenize(question);
  if (keywords.length === 0 || allowedLessonIds.length === 0) return [];

  // Keywords are alphanumeric-only (tokenize), so LIKE patterns are injection-safe.
  const rows = await db
    .select({
      lessonId: schema.lessonTranscripts.lessonId,
      moduleId: schema.lessons.moduleId,
      lessonTitle: schema.lessons.title,
      startSeconds: schema.lessonTranscripts.startSeconds,
      endSeconds: schema.lessonTranscripts.endSeconds,
      text: schema.lessonTranscripts.text,
    })
    .from(schema.lessonTranscripts)
    .innerJoin(schema.lessons, eq(schema.lessonTranscripts.lessonId, schema.lessons.id))
    .innerJoin(schema.modules, eq(schema.lessons.moduleId, schema.modules.id))
    .where(
      and(
        eq(schema.modules.courseId, courseId),
        inArray(schema.lessonTranscripts.lessonId, allowedLessonIds),
        or(...keywords.map((kw) => like(schema.lessonTranscripts.text, `%${kw}%`))),
      ),
    )
    .limit(MAX_CANDIDATES)
    .all();

  // Score by distinct keyword coverage (primary) + total occurrences (tiebreak).
  const scored = rows.map((r) => {
    const lower = r.text.toLowerCase();
    let distinct = 0;
    let total = 0;
    for (const kw of keywords) {
      const hits = lower.split(kw).length - 1;
      if (hits > 0) distinct++;
      total += hits;
    }
    return { chunk: r as RetrievedChunk, score: distinct * 100 + total };
  });
  scored.sort((a, b) => b.score - a.score);
  return scored.slice(0, MAX_SOURCES).map((s) => s.chunk);
}

const SYSTEM_PROMPT = `You are the ChiroSmarts course tutor for an Oregon Chiropractic Assistant (CA) continuing-education course. You help enrolled students understand the course material.

STRICT RULES:
- Answer ONLY using the numbered SOURCES provided in the user's message. The sources are excerpts from the course's own lesson videos.
- Cite every claim with the source number(s) it came from, like [1] or [2][3]. Place the citation right after the sentence it supports.
- If the sources do not contain the answer, say plainly that the course material doesn't cover it and suggest the student ask their instructor. Do NOT use outside knowledge to fill the gap.
- Decline clinical or medical advice (diagnosis, treatment, patient-specific guidance) and anything outside the scope of this CA training. Briefly say it's outside what this course tutor covers.
- Be concise and practical. Output only your final answer — no preamble, no meta-commentary about your reasoning or the sources list.
- Never invent a source number that wasn't provided.`;

/**
 * Run the tutor for one question. Retrieves entitled transcript chunks, asks
 * Haiku to answer over them, and returns the answer plus the citations it used
 * (deep-linked to the lesson + timestamp). Pure of HTTP concerns so it can be
 * unit-tested; the endpoint handles auth, entitlement, and audit logging.
 */
export async function askTutor(
  env: CloudflareEnv,
  db: Db,
  opts: {
    courseId: string;
    courseSlug: string;
    question: string;
    allowedLessonIds: string[];
  },
): Promise<TutorResult> {
  const chunks = await retrieveChunks(
    db,
    opts.courseId,
    opts.allowedLessonIds,
    opts.question,
  );

  if (chunks.length === 0) {
    return {
      answer:
        "I couldn't find anything in this course's lessons about that. I can only answer from the course material — for anything outside it, please ask your instructor.",
      citations: [],
    };
  }
  if (!env.ANTHROPIC_API_KEY) {
    return {
      answer:
        "The tutor isn't configured yet (missing API key). Please try again later or contact your instructor.",
      citations: [],
    };
  }

  const sourcesText = chunks
    .map(
      (c, i) =>
        `[${i + 1}] Lesson "${c.lessonTitle}" at ${fmtTimestamp(c.startSeconds)}:\n${c.text}`,
    )
    .join("\n\n");

  const client = new Anthropic({ apiKey: env.ANTHROPIC_API_KEY });
  const message = await client.messages.create({
    model: MODEL,
    max_tokens: 1024,
    system: SYSTEM_PROMPT,
    messages: [
      {
        role: "user",
        content: `SOURCES:\n${sourcesText}\n\nQUESTION: ${opts.question}`,
      },
    ],
  });

  if (message.stop_reason === "refusal") {
    return {
      answer: "I can't help with that request. Please keep questions to the course material.",
      citations: [],
    };
  }

  const answer = message.content
    .filter((b): b is Anthropic.TextBlock => b.type === "text")
    .map((b) => b.text)
    .join("")
    .trim();

  // Build citations only for source numbers the answer actually referenced.
  const cited = new Set<number>();
  for (const m of answer.matchAll(/\[(\d{1,2})\]/g)) {
    const n = Number(m[1]);
    if (n >= 1 && n <= chunks.length) cited.add(n);
  }
  const citations: Citation[] = [...cited]
    .sort((a, b) => a - b)
    .map((n) => {
      const c = chunks[n - 1];
      const t = Math.floor(c.startSeconds);
      return {
        n,
        lessonTitle: c.lessonTitle,
        timestamp: fmtTimestamp(c.startSeconds),
        href: `/learn/${opts.courseSlug}/${c.moduleId}/${c.lessonId}?t=${t}`,
      };
    });

  return { answer: answer || "(no answer)", citations };
}
