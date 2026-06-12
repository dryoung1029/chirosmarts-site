/**
 * Admin: embed transcript chunks for the tutor's semantic search (access enforced
 * in middleware). Processes one batch of not-yet-embedded chunks per call and
 * reports how many remain, so it can be drained by repeated calls without hitting
 * Worker time limits. Idempotent — already-embedded chunks are skipped.
 */
import type { APIRoute } from "astro";
import { and, eq, isNull, sql } from "drizzle-orm";
import { getDb, schema } from "@/db/client";
import { newId } from "@/lib/crypto";
import { EMBED_MODEL, EMBED_DIM, embedTexts, packVector } from "@/lib/embeddings";

const BATCH = 250;

export const POST: APIRoute = async ({ locals }) => {
  const env = locals.runtime.env;
  if (!env.AI) {
    return json({ ok: false, message: "Workers AI (AI binding) not configured." }, 503);
  }
  const db = getDb(env);

  const todo = await db
    .select({
      id: schema.lessonTranscripts.id,
      lessonId: schema.lessonTranscripts.lessonId,
      text: schema.lessonTranscripts.text,
    })
    .from(schema.lessonTranscripts)
    .leftJoin(
      schema.transcriptEmbeddings,
      and(
        eq(schema.transcriptEmbeddings.lessonTranscriptId, schema.lessonTranscripts.id),
        eq(schema.transcriptEmbeddings.model, EMBED_MODEL),
      ),
    )
    .where(isNull(schema.transcriptEmbeddings.id))
    .limit(BATCH)
    .all();

  let embedded = 0;
  if (todo.length > 0) {
    const vectors = await embedTexts(env, todo.map((t) => t.text));
    for (let i = 0; i < todo.length; i++) {
      const v = vectors[i];
      if (!v) continue;
      await db.insert(schema.transcriptEmbeddings).values({
        id: newId("emb"),
        lessonTranscriptId: todo[i].id,
        lessonId: todo[i].lessonId,
        model: EMBED_MODEL,
        dim: EMBED_DIM,
        vector: Buffer.from(packVector(v)),
      });
      embedded++;
    }
  }

  const remainingRow = await db
    .select({ n: sql<number>`count(*)` })
    .from(schema.lessonTranscripts)
    .leftJoin(
      schema.transcriptEmbeddings,
      and(
        eq(schema.transcriptEmbeddings.lessonTranscriptId, schema.lessonTranscripts.id),
        eq(schema.transcriptEmbeddings.model, EMBED_MODEL),
      ),
    )
    .where(isNull(schema.transcriptEmbeddings.id))
    .get();

  return json({ ok: true, embedded, remaining: remainingRow?.n ?? 0 }, 200);
};

function json(data: unknown, status: number) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "content-type": "application/json" },
  });
}
