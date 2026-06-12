/**
 * Workers AI embeddings for the tutor's semantic search. Transcript chunks and
 * the student's question are embedded with the same model; ranking is cosine
 * similarity (vectors are normalized on store, so cosine is a plain dot product).
 * Vectors live in D1 (`transcript_embeddings`); at this corpus size we load a
 * course's vectors and rank in-JS — no Vectorize required.
 */
export const EMBED_MODEL = "@cf/baai/bge-small-en-v1.5";
export const EMBED_DIM = 384;

// bge retrieval works best when the QUERY carries this instruction; passages are
// embedded as-is.
const QUERY_PREFIX = "Represent this sentence for searching relevant passages: ";

function normalize(v: number[]): number[] {
  let s = 0;
  for (const x of v) s += x * x;
  const n = Math.sqrt(s) || 1;
  return v.map((x) => x / n);
}

/** Embed texts (passages) → one normalized vector each. Batched for the AI API. */
export async function embedTexts(
  env: CloudflareEnv,
  texts: string[],
): Promise<number[][]> {
  if (!env.AI) throw new Error("Workers AI binding (AI) is not configured");
  const out: number[][] = [];
  const BATCH = 50;
  for (let i = 0; i < texts.length; i += BATCH) {
    const res = await env.AI.run(EMBED_MODEL, { text: texts.slice(i, i + BATCH) });
    for (const v of res.data) out.push(normalize(v));
  }
  return out;
}

/** Embed a search query (with the bge retrieval instruction). */
export async function embedQuery(
  env: CloudflareEnv,
  question: string,
): Promise<number[]> {
  const [v] = await embedTexts(env, [QUERY_PREFIX + question]);
  return v;
}

/** Pack a vector to little-endian Float32 bytes for D1 storage. */
export function packVector(v: number[]): Uint8Array {
  return new Uint8Array(Float32Array.from(v).buffer);
}

/** Unpack stored bytes back to a Float32Array. */
export function unpackVector(buf: ArrayBuffer | Uint8Array): Float32Array {
  const u = buf instanceof Uint8Array ? buf : new Uint8Array(buf);
  // Copy to guarantee 4-byte alignment for the Float32 view.
  return new Float32Array(u.slice().buffer);
}

/** Cosine similarity of two NORMALIZED vectors (= dot product). */
export function cosine(a: ArrayLike<number>, b: ArrayLike<number>): number {
  let d = 0;
  const n = Math.min(a.length, b.length);
  for (let i = 0; i < n; i++) d += a[i] * b[i];
  return d;
}
