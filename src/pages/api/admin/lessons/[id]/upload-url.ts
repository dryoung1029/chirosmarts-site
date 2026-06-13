/**
 * Admin: tus "direct creator upload" creation proxy (access enforced in
 * middleware). The browser's tus client POSTs the upload-creation request here;
 * we forward it to Cloudflare Stream with the API token (which never reaches the
 * browser), force signed-URL playback, and hand back Cloudflare's one-time
 * upload URL. The browser then PATCHes the video bytes straight to Cloudflare —
 * the large file body never passes through this Worker.
 */
import type { APIRoute } from "astro";
import { eq } from "drizzle-orm";
import { getDb, schema } from "@/db/client";
import { isStreamManagementConfigured } from "@/lib/stream";

// Generous reservation; the real runtime is recorded once Stream finishes.
const MAX_DURATION_SECONDS = 21600; // 6h

const b64 = (s: string) => btoa(unescape(encodeURIComponent(s)));

/** Pull a value out of a tus Upload-Metadata header (key base64,key2 base64,…). */
function metaValue(meta: string, key: string): string | null {
  for (const pair of meta.split(",")) {
    const [k, v] = pair.trim().split(" ");
    if (k === key && v) {
      try {
        return decodeURIComponent(escape(atob(v)));
      } catch {
        return atob(v);
      }
    }
  }
  return null;
}

export const POST: APIRoute = async ({ params, request, locals }) => {
  const env = locals.runtime.env;
  const db = getDb(env);
  const id = params.id!;

  const lesson = await db
    .select({ id: schema.lessons.id })
    .from(schema.lessons)
    .where(eq(schema.lessons.id, id))
    .get();
  if (!lesson) return new Response("Lesson not found.", { status: 404 });
  if (!isStreamManagementConfigured(env)) {
    return new Response("Stream API token not configured (set CF_STREAM_API_TOKEN).", { status: 400 });
  }

  const uploadLength = request.headers.get("Upload-Length");
  if (!uploadLength) return new Response("Missing Upload-Length.", { status: 400 });

  const clientMeta = request.headers.get("Upload-Metadata") ?? "";
  const name =
    metaValue(clientMeta, "name") || metaValue(clientMeta, "filename") || `lesson ${id}`;

  // We set the metadata ourselves so playback always requires a signed URL,
  // matching the player's signed-token setup — never trust the client for this.
  const uploadMetadata = [
    `name ${b64(name)}`,
    "requiresignedurls",
    `maxDurationSeconds ${b64(String(MAX_DURATION_SECONDS))}`,
  ].join(",");

  const cf = await fetch(
    `https://api.cloudflare.com/client/v4/accounts/${env.CF_ACCOUNT_ID}/stream?direct_user=true`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${env.CF_STREAM_API_TOKEN}`,
        "Tus-Resumable": "1.0.0",
        "Upload-Length": uploadLength,
        "Upload-Metadata": uploadMetadata,
      },
    },
  );

  if (cf.status !== 201) {
    const detail = await cf.text().catch(() => "");
    return new Response(`Couldn't start the upload (Stream HTTP ${cf.status}). ${detail}`.trim(), {
      status: 502,
    });
  }

  const location = cf.headers.get("Location");
  const mediaId = cf.headers.get("stream-media-id");
  if (!location) return new Response("Stream didn't return an upload URL.", { status: 502 });

  // Hand the one-time Cloudflare URL back to the tus client; expose the media id
  // so the client can attach it to the lesson when the upload completes.
  const headers = new Headers({
    "Tus-Resumable": "1.0.0",
    Location: location,
    "Access-Control-Expose-Headers": "Location, stream-media-id",
  });
  if (mediaId) headers.set("stream-media-id", mediaId);
  return new Response(null, { status: 201, headers });
};
