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
import { and, asc, eq, inArray, or, like } from "drizzle-orm";
import type { Db } from "@/db/client";
import { schema } from "@/db/client";
import {
  EMBED_MODEL,
  embedQuery,
  cosine,
  unpackVector,
} from "@/lib/embeddings";

const MODEL = "claude-haiku-4-5";
const MAX_CANDIDATES = 800; // keyword-matching candidate chunks to score
const MAX_ANCHORS = 12; // top-scoring chunks to expand into passages
const MIN_SIM = 0.32; // minimum cosine for a semantic anchor (else: off-topic)
const WINDOW_BACK = 1; // neighbouring chunks before an anchor
const WINDOW_FWD = 2; // neighbouring chunks after an anchor (claims often follow setup)
const MAX_PASSAGES = 12; // passages handed to the model
const MAX_PASSAGE_CHARS = 1200; // cap a single merged passage

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

interface Anchor {
  lessonId: string;
  chunkIndex: number;
  score: number;
}

/**
 * Keyword/IDF anchors: top transcript chunks for a question by stemmed-term
 * relevance with a lesson-title boost. The fallback when embeddings are absent,
 * and the hybrid partner for semantic retrieval (keeps exact-term matches).
 */
async function keywordAnchors(
  db: Db,
  courseId: string,
  allowedLessonIds: string[],
  question: string,
): Promise<Anchor[]> {
  const keywords = tokenize(question);
  if (keywords.length === 0 || allowedLessonIds.length === 0) return [];

  // Light stemming: match/score on a 5-char stem for longer words so morphological
  // variants bridge the question↔transcript gap (founded↔founder↔founding,
  // vital↔vitals, certif↔certificate/certified, adjust↔adjustment). Short words
  // stay whole. IDF below keeps over-broad stems from dominating.
  const stem = (w: string) => (w.length >= 6 ? w.slice(0, 5) : w);
  const terms = [...new Set(keywords.map(stem))];

  type Row = {
    lessonId: string;
    moduleId: string;
    lessonTitle: string;
    chunkIndex: number;
    startSeconds: number;
    endSeconds: number;
    text: string;
  };
  const select = {
    lessonId: schema.lessonTranscripts.lessonId,
    moduleId: schema.lessons.moduleId,
    lessonTitle: schema.lessons.title,
    chunkIndex: schema.lessonTranscripts.chunkIndex,
    startSeconds: schema.lessonTranscripts.startSeconds,
    endSeconds: schema.lessonTranscripts.endSeconds,
    text: schema.lessonTranscripts.text,
  };

  // 1) Candidates: chunks whose TEXT or LESSON TITLE matches any keyword.
  // (Keywords are alphanumeric-only, so the LIKE patterns are injection-safe.)
  const rows = (await db
    .select(select)
    .from(schema.lessonTranscripts)
    .innerJoin(schema.lessons, eq(schema.lessonTranscripts.lessonId, schema.lessons.id))
    .innerJoin(schema.modules, eq(schema.lessons.moduleId, schema.modules.id))
    .where(
      and(
        eq(schema.modules.courseId, courseId),
        inArray(schema.lessonTranscripts.lessonId, allowedLessonIds),
        or(
          ...terms.flatMap((kw) => [
            like(schema.lessonTranscripts.text, `%${kw}%`),
            like(schema.lessons.title, `%${kw}%`),
          ]),
        ),
      ),
    )
    .limit(MAX_CANDIDATES)
    .all()) as Row[];
  if (rows.length === 0) return [];

  // 2) IDF over the candidate set — rarer query terms are more discriminating.
  const df = new Map(terms.map((kw) => [kw, 0]));
  for (const r of rows) {
    const lower = r.text.toLowerCase();
    for (const kw of terms) if (lower.includes(kw)) df.set(kw, df.get(kw)! + 1);
  }
  const idf = (kw: string) => Math.log((rows.length + 1) / ((df.get(kw) || 0) + 1)) + 1;

  // 3) Score each candidate; a lesson-title match strongly signals topicality.
  const scored = rows
    .map((r) => {
      const lower = r.text.toLowerCase();
      const titleLower = r.lessonTitle.toLowerCase();
      let s = 0;
      for (const kw of terms) {
        const occ = lower.split(kw).length - 1;
        if (occ > 0) s += idf(kw) * (1 + Math.log(occ));
        if (titleLower.includes(kw)) s += 2 * idf(kw);
      }
      return { r, s };
    })
    .filter((x) => x.s > 0)
    .sort((a, b) => b.s - a.s);
  if (scored.length === 0) return [];

  // 4) Top anchors (dedupe by lesson+index).
  const anchors: { r: Row; s: number }[] = [];
  const seen = new Set<string>();
  for (const x of scored) {
    const key = `${x.r.lessonId}:${x.r.chunkIndex}`;
    if (seen.has(key)) continue;
    seen.add(key);
    anchors.push(x);
    if (anchors.length >= MAX_ANCHORS) break;
  }

  return anchors.map((a) => ({
    lessonId: a.r.lessonId,
    chunkIndex: a.r.chunkIndex,
    score: a.s,
  }));
}

/**
 * Semantic anchors via Workers AI embeddings + cosine over the course's vectors.
 * Returns null when AI/embeddings are unavailable (caller falls back to keywords),
 * or [] when AI ran but nothing cleared the similarity bar (off-topic).
 */
async function semanticAnchors(
  env: CloudflareEnv,
  db: Db,
  allowedLessonIds: string[],
  question: string,
): Promise<Anchor[] | null> {
  if (!env.AI || allowedLessonIds.length === 0) return null;
  const rows = await db
    .select({
      lessonId: schema.transcriptEmbeddings.lessonId,
      chunkIndex: schema.lessonTranscripts.chunkIndex,
      vector: schema.transcriptEmbeddings.vector,
    })
    .from(schema.transcriptEmbeddings)
    .innerJoin(
      schema.lessonTranscripts,
      eq(schema.transcriptEmbeddings.lessonTranscriptId, schema.lessonTranscripts.id),
    )
    .where(
      and(
        inArray(schema.transcriptEmbeddings.lessonId, allowedLessonIds),
        eq(schema.transcriptEmbeddings.model, EMBED_MODEL),
      ),
    )
    .all();
  if (rows.length === 0) return null; // not embedded yet → keyword fallback

  let qv: number[];
  try {
    qv = await embedQuery(env, question);
  } catch (e) {
    console.error("[tutor] query embedding failed", e);
    return null;
  }
  const scored = rows
    .map((r) => ({
      lessonId: r.lessonId,
      chunkIndex: r.chunkIndex,
      score: cosine(qv, unpackVector(r.vector as unknown as Uint8Array)),
    }))
    .sort((a, b) => b.score - a.score);
  if (scored.length === 0 || scored[0].score < MIN_SIM) return [];
  return scored.filter((x) => x.score >= MIN_SIM).slice(0, MAX_ANCHORS);
}

/**
 * Expand anchors with neighbouring chunks and merge contiguous ones into coherent
 * multi-sentence passages, so the model sees whole points rather than one-line
 * cues. Shared by the keyword and semantic paths.
 */
async function buildPassages(db: Db, anchors: Anchor[]): Promise<RetrievedChunk[]> {
  if (anchors.length === 0) return [];
  type Row = {
    lessonId: string;
    moduleId: string;
    lessonTitle: string;
    chunkIndex: number;
    startSeconds: number;
    endSeconds: number;
    text: string;
  };
  const anchorLessonIds = [...new Set(anchors.map((a) => a.lessonId))];
  const lessonChunks = (await db
    .select({
      lessonId: schema.lessonTranscripts.lessonId,
      moduleId: schema.lessons.moduleId,
      lessonTitle: schema.lessons.title,
      chunkIndex: schema.lessonTranscripts.chunkIndex,
      startSeconds: schema.lessonTranscripts.startSeconds,
      endSeconds: schema.lessonTranscripts.endSeconds,
      text: schema.lessonTranscripts.text,
    })
    .from(schema.lessonTranscripts)
    .innerJoin(schema.lessons, eq(schema.lessonTranscripts.lessonId, schema.lessons.id))
    .where(inArray(schema.lessonTranscripts.lessonId, anchorLessonIds))
    .orderBy(asc(schema.lessonTranscripts.lessonId), asc(schema.lessonTranscripts.chunkIndex))
    .all()) as Row[];
  const byLesson = new Map<string, Map<number, Row>>();
  for (const c of lessonChunks) {
    if (!byLesson.has(c.lessonId)) byLesson.set(c.lessonId, new Map());
    byLesson.get(c.lessonId)!.set(c.chunkIndex, c);
  }

  const wanted = new Map<string, Map<number, number>>();
  for (const a of anchors) {
    const m = wanted.get(a.lessonId) ?? new Map<number, number>();
    for (let d = -WINDOW_BACK; d <= WINDOW_FWD; d++) {
      const idx = a.chunkIndex + d;
      m.set(idx, Math.max(m.get(idx) ?? 0, a.score));
    }
    wanted.set(a.lessonId, m);
  }

  const passages: { score: number; chunk: RetrievedChunk }[] = [];
  for (const [lessonId, idxScores] of wanted) {
    const chunkMap = byLesson.get(lessonId);
    if (!chunkMap) continue;
    const indices = [...idxScores.keys()].filter((i) => chunkMap.has(i)).sort((a, b) => a - b);
    let run: number[] = [];
    const flush = () => {
      if (run.length === 0) return;
      const cs = run.map((i) => chunkMap.get(i)!);
      let text = cs.map((c) => c.text).join(" ");
      if (text.length > MAX_PASSAGE_CHARS) text = text.slice(0, MAX_PASSAGE_CHARS) + "…";
      passages.push({
        score: Math.max(...run.map((i) => idxScores.get(i) ?? 0)),
        chunk: {
          lessonId,
          moduleId: cs[0].moduleId,
          lessonTitle: cs[0].lessonTitle,
          startSeconds: cs[0].startSeconds,
          endSeconds: cs[cs.length - 1].endSeconds,
          text,
        },
      });
      run = [];
    };
    for (let k = 0; k < indices.length; k++) {
      if (k > 0 && indices[k] !== indices[k - 1] + 1) flush();
      run.push(indices[k]);
    }
    flush();
  }
  passages.sort((a, b) => b.score - a.score);
  return passages.slice(0, MAX_PASSAGES).map((p) => p.chunk);
}

/**
 * Retrieve the most relevant transcript PASSAGES the student may see, entitlement-
 * scoped to `allowedLessonIds`. Prefers Workers AI semantic search (cosine over
 * embeddings), hybridized with keyword/IDF anchors so exact-term matches aren't
 * lost; falls back to pure keyword retrieval when embeddings/AI are absent.
 */
export async function retrieveChunks(
  env: CloudflareEnv,
  db: Db,
  courseId: string,
  allowedLessonIds: string[],
  question: string,
): Promise<RetrievedChunk[]> {
  const sem = await semanticAnchors(env, db, allowedLessonIds, question);
  const kw = await keywordAnchors(db, courseId, allowedLessonIds, question);

  let anchors: Anchor[];
  if (sem === null) {
    anchors = kw; // semantic unavailable → keyword only
  } else {
    // Hybrid: semantic first (higher quality), then fill with keyword anchors.
    const seen = new Set<string>();
    anchors = [];
    for (const a of [...sem, ...kw]) {
      const key = `${a.lessonId}:${a.chunkIndex}`;
      if (seen.has(key)) continue;
      seen.add(key);
      anchors.push(a);
      if (anchors.length >= MAX_ANCHORS) break;
    }
  }
  return buildPassages(db, anchors);
}

const SYSTEM_PROMPT = `You are the ChiroSmarts course tutor for an Oregon Chiropractic Assistant (CA) continuing-education course. Help the enrolled student understand the material.

HOW TO ANSWER:
- The numbered SOURCES are excerpts from the course's own lesson videos. Answer using them — synthesize across sources, connect related points, and explain in your own words. You don't need a citation to restate something the sources clearly imply.
- Make a genuine attempt before giving up. The sources are retrieved by relevance and may phrase things differently from the question; read them for meaning, not exact words. If several sources each contribute part of the answer, combine them.
- Cite the source number(s) you drew from, like [2] or [3][5], right after the sentence they support. Never invent a source number.
- Only say the topic "isn't covered in the course material" (and suggest asking the instructor) if the sources genuinely have nothing relevant — not merely because the wording differs or the answer is incomplete. A partial answer grounded in the sources is better than a refusal.
- Decline clinical or medical advice (diagnosis, treatment, patient-specific guidance) and anything outside this CA course.
- Be clear, concise, and practical. Output only your final answer — no preamble or meta-commentary about the sources.`;

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
    env,
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
